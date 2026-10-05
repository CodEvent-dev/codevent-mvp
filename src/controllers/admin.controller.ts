/**
 * Controleurs de l'espace agent (prive, authentifie).
 * Regroupe le tableau de bord, la gestion des tickets et les exports.
 * Chaque lecture/mutation est cloisonnee aux specialites de l'agent.
 */
import { Request, Response } from "express";
import { env } from "../config/env";
import {
  listForDashboard,
  getDashboardStats,
  getSignalementDetail,
  changeSignalementStatus,
  addInternalNoteToSignalement,
  withResolvedCoordinates,
  reassignSignalement,
} from "../services/signalement.service";
import { buildCsvExport, buildPdfExport, categoryLabel, statusLabel } from "../services/export.service";
import { runRetentionPurge } from "../services/purge.service";
import {
  listFilterSchema,
  updateStatusSchema,
  addNoteSchema,
  reassignSchema,
} from "../utils/validators";
import { AppError } from "../utils/AppError";
import { AgentAccess } from "../services/access.service";
import { CATEGORIES, categoryShortLabel } from "../domain/categories";
import { listAssignableAgents } from "../models/agent.model";

function currentAccess(req: Request): AgentAccess {
  if (!req.agentAccess) {
    throw new AppError("Session invalide.", 401);
  }
  return req.agentAccess;
}

export function showDashboard(req: Request, res: Response): void {
  const access = currentAccess(req);
  const filters = listFilterSchema.parse({
    status: req.query.status || undefined,
    category: req.query.category || undefined,
    sort: req.query.sort || "date_desc",
    q: req.query.q || undefined,
  });

  const signalements = listForDashboard(filters, access).map((s) => ({
    ...s,
    categoryLabel: categoryLabel(s.category),
    serviceLabel: categoryLabel(s.assigned_service || s.category),
    statusLabel: statusLabel(s.status),
  }));

  const stats = getDashboardStats(access);
  const totalEnAttente = stats.nouveau;
  const totalEnCours = stats.pris_en_compte + stats.en_cours;
  const totalResolus = stats.resolu;

  const visibleCategories =
    access.role === "admin" ? [...CATEGORIES] : access.specialties;

  res.render("admin/dashboard", {
    title: `Tableau de bord - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    agentUsername: req.session.agentUsername,
    signalements,
    filters,
    stats: { totalEnAttente, totalEnCours, totalResolus, ...stats },
    visibleCategories: visibleCategories.map((value) => ({
      value,
      label: categoryShortLabel(value),
    })),
    isGlobalViewer: access.role === "admin",
  });
}

export async function showSignalementDetail(req: Request, res: Response): Promise<void> {
  const access = currentAccess(req);
  const signalement = await withResolvedCoordinates(
    getSignalementDetail(req.params.id, access)
  );
  const service = signalement.assigned_service || signalement.category;
  const assignableAgents = listAssignableAgents();

  res.render("admin/detail", {
    title: `Signalement ${signalement.reference_code} - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    agentUsername: req.session.agentUsername,
    isGlobalViewer: access.role === "admin",
    assignableAgents,
    serviceOptions: CATEGORIES.map((value) => ({
      value,
      label: categoryShortLabel(value),
    })),
    signalement: {
      ...signalement,
      categoryLabel: categoryLabel(signalement.category),
      serviceLabel: categoryLabel(service),
      statusLabel: statusLabel(signalement.status),
    },
  });
}

export function updateSignalementStatus(req: Request, res: Response): void {
  const { status } = updateStatusSchema.parse(req.body);
  changeSignalementStatus(req.params.id, status, currentAccess(req));
  res.redirect(`/admin/signalements/${req.params.id}`);
}

export function addInternalNote(req: Request, res: Response): void {
  const { note } = addNoteSchema.parse(req.body);
  const author = req.session.agentUsername ?? "agent";
  addInternalNoteToSignalement(req.params.id, note, author, currentAccess(req));
  res.redirect(`/admin/signalements/${req.params.id}`);
}

export function reassignTicket(req: Request, res: Response): void {
  const parsed = reassignSchema.parse(req.body);
  reassignSignalement(
    req.params.id,
    parsed.assigned_service,
    parsed.assigned_agent_id,
    currentAccess(req)
  );
  res.redirect(`/admin/signalements/${req.params.id}`);
}

export function exportCsv(req: Request, res: Response): void {
  const access = currentAccess(req);
  const filters = listFilterSchema.parse({
    status: req.query.status || undefined,
    category: req.query.category || undefined,
    sort: "date_desc",
  });

  const signalements = listForDashboard(filters, access);
  const csv = buildCsvExport(signalements);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="signalements_${new Date().toISOString().slice(0, 10)}.csv"`
  );
  res.send(csv);
}

export async function exportPdf(req: Request, res: Response): Promise<void> {
  const access = currentAccess(req);
  const filters = listFilterSchema.parse({
    status: req.query.status || undefined,
    category: req.query.category || undefined,
    sort: "date_desc",
  });

  const signalements = listForDashboard(filters, access);
  const pdfBuffer = await buildPdfExport(signalements, env.COMMUNE_NAME);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="signalements_${new Date().toISOString().slice(0, 10)}.pdf"`
  );
  res.send(pdfBuffer);
}

/** Declenchement manuel de la purge RGPD depuis le tableau de bord */
export function triggerRetentionPurge(req: Request, res: Response): void {
  if (req.session.agentRole !== "admin") {
    throw new AppError("Seul un administrateur peut declencher la purge des donnees.", 403);
  }
  const result = runRetentionPurge();
  res.redirect(`/admin/dashboard?purged=${result.anonymizedCount}`);
}

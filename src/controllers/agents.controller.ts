/**
 * Back-office de gestion des comptes agents et de leurs specialites.
 */
import { Request, Response } from "express";
import { env } from "../config/env";
import { CATEGORIES, categoryShortLabel } from "../domain/categories";
import {
  createManagedAgent,
  listManagedAgents,
  updateManagedAgent,
} from "../services/agentAdmin.service";
import { parseSpecialtyFlags } from "../services/access.service";
import { createAgentSchema, updateAgentSchema } from "../utils/validators";
import { AppError } from "../utils/AppError";

function currentAccess(req: Request) {
  if (!req.agentAccess) {
    throw new AppError("Session invalide.", 401);
  }
  return req.agentAccess;
}

export function showAgentsPage(req: Request, res: Response): void {
  const notice =
    req.query.created === "1"
      ? "Le compte agent a ete cree."
      : req.query.updated === "1"
        ? "Le compte agent a ete mis a jour."
        : null;

  res.render("admin/agents", {
    title: `Agents et services - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    agentUsername: req.session.agentUsername,
    agents: listManagedAgents(),
    categories: CATEGORIES.map((value) => ({
      value,
      label: categoryShortLabel(value),
    })),
    notice,
  });
}

export async function handleCreateAgent(req: Request, res: Response): Promise<void> {
  currentAccess(req);
  const parsed = createAgentSchema.parse(req.body);
  const specialties = parseSpecialtyFlags(req.body as Record<string, unknown>);
  await createManagedAgent({ ...parsed, specialties });
  res.redirect("/admin/agents?created=1");
}

export async function handleUpdateAgent(req: Request, res: Response): Promise<void> {
  const access = currentAccess(req);
  const parsed = updateAgentSchema.parse(req.body);
  const specialties = parseSpecialtyFlags(req.body as Record<string, unknown>);
  await updateManagedAgent(req.params.id, { ...parsed, specialties }, access.id);
  res.redirect("/admin/agents?updated=1");
}

/**
 * Controleurs de l'espace citoyen (public, sans authentification).
 * Aucune donnee sensible (notes internes, IP) n'est jamais exposee ici.
 */
import { Request, Response } from "express";
import { env } from "../config/env";
import {
  createPublicSignalement,
  findPublicSignalementByCode,
} from "../services/signalement.service";
import { createSignalementSchema, trackingCodeSchema } from "../utils/validators";
import { categoryLabel, statusLabel } from "../services/export.service";
import { reverseGeocode } from "../services/geocode.service";
import { AppError } from "../utils/AppError";

/** Page d'accueil : formulaire de signalement en 3 etapes */
export function showHomePage(req: Request, res: Response): void {
  res.render("public/index", {
    title: `Signaler un probleme - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
  });
}

/** Traitement de la soumission du formulaire de signalement */
export async function submitSignalement(req: Request, res: Response): Promise<void> {
  if (typeof req.body?.website === "string" && req.body.website.trim() !== "") {
    throw new AppError("Requete invalide.", 400);
  }

  const parsed = createSignalementSchema.parse(req.body);

  const clientIp = req.ip ?? "0.0.0.0";
  const photoBuffer = req.file?.buffer ?? null;

  const result = await createPublicSignalement(parsed, photoBuffer, clientIp);

  res.status(201).json({
    success: true,
    referenceCode: result.referenceCode,
  });
}

/** Page de confirmation apres envoi (affiche le code de suivi) */
export function showConfirmationPage(req: Request, res: Response): void {
  const raw = String(req.query.code ?? "");
  const parsed = trackingCodeSchema.safeParse(raw);
  res.render("public/confirmation", {
    title: "Signalement envoye",
    communeName: env.COMMUNE_NAME,
    referenceCode: parsed.success ? parsed.data.toUpperCase() : "",
  });
}

/** Formulaire de suivi (saisie du code) */
export function showTrackingForm(req: Request, res: Response): void {
  const raw = String(req.query.code ?? "");
  const parsed = trackingCodeSchema.safeParse(raw);
  res.render("public/suivi", {
    title: `Suivre mon signalement - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    result: null,
    error: null,
    prefilledCode: parsed.success ? parsed.data.toUpperCase() : "",
  });
}

/** Recherche et affichage du statut d'un signalement via son code */
export function handleTrackingLookup(req: Request, res: Response): void {
  const rawCode = String(req.body.code ?? "");

  const parseResult = trackingCodeSchema.safeParse(rawCode);
  if (!parseResult.success) {
    res.render("public/suivi", {
      title: `Suivre mon signalement - ${env.COMMUNE_NAME}`,
      communeName: env.COMMUNE_NAME,
      result: null,
      error: "Le format du code de suivi saisi est invalide.",
      prefilledCode: rawCode,
    });
    return;
  }

  const signalement = findPublicSignalementByCode(parseResult.data);

  if (!signalement) {
    res.render("public/suivi", {
      title: `Suivre mon signalement - ${env.COMMUNE_NAME}`,
      communeName: env.COMMUNE_NAME,
      result: null,
      error: "Aucun signalement ne correspond a ce code de suivi.",
      prefilledCode: parseResult.data,
    });
    return;
  }

  res.render("public/suivi", {
    title: `Suivre mon signalement - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    error: null,
    prefilledCode: parseResult.data,
    result: {
      ...signalement,
      categoryLabel: categoryLabel(signalement.category),
      statusLabel: statusLabel(signalement.status),
    },
  });
}

/** API JSON de suivi (utilisee par la page de confirmation en AJAX si besoin) */
export function apiTrackingLookup(req: Request, res: Response): void {
  const code = String(req.params.code ?? "");
  const parseResult = trackingCodeSchema.safeParse(code);

  if (!parseResult.success) {
    throw new AppError("Format de code de suivi invalide.", 400);
  }

  const signalement = findPublicSignalementByCode(parseResult.data);
  if (!signalement) {
    throw new AppError("Aucun signalement ne correspond a ce code.", 404);
  }

  res.json({
    referenceCode: signalement.referenceCode,
    category: signalement.category,
    categoryLabel: categoryLabel(signalement.category),
    status: signalement.status,
    statusLabel: statusLabel(signalement.status),
    createdAt: signalement.createdAt,
    updatedAt: signalement.updatedAt,
  });
}

/**
 * Transforme des coordonnees GPS en adresse la plus proche
 * (Base Adresse Nationale, service public francais).
 */
export async function reverseGeocodeAddress(req: Request, res: Response): Promise<void> {
  const latitude = Number(req.query.lat);
  const longitude = Number(req.query.lon);
  const accuracy = Number(req.query.accuracy);
  const hintOnly = String(req.query.hint ?? "") === "1";
  const maxAccuracy = hintOnly ? 20_000 : 30;
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > maxAccuracy) {
    throw new AppError(
      hintOnly
        ? "Impossible d'estimer la commune a partir de cette position."
        : "La position GPS n'est pas assez precise. Il faut 30 metres ou moins.",
      400
    );
  }
  const address = await reverseGeocode(latitude, longitude);
  res.json({ address, hint: hintOnly });
}

/** Mentions legales (LCEN) et information des personnes (RGPD, art. 13). */
export function showLegalNotice(req: Request, res: Response): void {
  res.render("public/mentions-legales", {
    title: `Mentions légales et protection des données - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    retentionDays: env.DATA_RETENTION_DAYS,
    sessionHours: env.SESSION_MAX_AGE_HOURS,
    legal: {
      address: env.COMMUNE_ADDRESS,
      phone: env.COMMUNE_PHONE,
      email: env.COMMUNE_EMAIL,
      siren: env.COMMUNE_SIREN,
      director: env.PUBLICATION_DIRECTOR,
      dpo: env.DPO_CONTACT,
      hostName: env.HOST_NAME,
      hostAddress: env.HOST_ADDRESS,
      hostPhone: env.HOST_PHONE,
    },
  });
}

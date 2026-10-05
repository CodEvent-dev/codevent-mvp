/**
 * Schemas de validation (zod) pour toutes les entrees utilisateur.
 * Toute donnee entrant dans l'application transite par ces schemas :
 * c'est la premiere ligne de defense contre les injections et les
 * donnees malformees (cf. exigences securite du cahier des charges).
 */
import { z } from "zod";
import { stripControlChars } from "./cryptoSafe";
import { CATEGORIES } from "../domain/categories";

export { CATEGORIES };

export const STATUSES = [
  "nouveau",
  "pris_en_compte",
  "en_cours",
  "resolu",
  "rejete",
] as const;

const cleanText = (allowNewlines = false) =>
  z
    .string()
    .transform((v) => stripControlChars(v, allowNewlines).trim());

export const createSignalementSchema = z.object({
  category: z.enum(CATEGORIES, {
    errorMap: () => ({ message: "Merci de choisir une categorie valide." }),
  }),
  description: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((v) => stripControlChars(String(v ?? ""), true).trim())
    .pipe(z.string().max(1000, "La description ne doit pas depasser 1000 caracteres.")),
  address: z
    .string()
    .transform((v) => stripControlChars(v, false).trim())
    .pipe(
      z
        .string()
        .min(3, "Merci d'indiquer une adresse ou un lieu (3 caracteres minimum).")
        .max(255, "L'adresse est trop longue (255 caracteres maximum).")
    ),
  latitude: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().finite().min(-90).max(90).optional()
  ),
  longitude: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().finite().min(-180).max(180).optional()
  ),
  gps_accuracy: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : Number(v)),
    z.number().finite().nonnegative().optional()
  ),
  website: z
    .string()
    .optional()
    .refine((v) => !v, { message: "Requete invalide." }),
  other_precision: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((v) => stripControlChars(String(v ?? ""), false).trim())
    .pipe(z.string().max(200, "La precision est trop longue (200 caracteres maximum).")),
}).superRefine((data, ctx) => {
  if (data.category === "autre" && data.other_precision.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["other_precision"],
      message: "Pour la categorie Autre, merci de preciser le type de probleme (3 caracteres minimum).",
    });
  }
  const hasLat = data.latitude !== undefined;
  const hasLon = data.longitude !== undefined;
  if (hasLat !== hasLon) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["latitude"],
      message: "Les coordonnees GPS sont incompletes.",
    });
  }
  if (hasLat && hasLon && (data.gps_accuracy === undefined || data.gps_accuracy > 30)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["gps_accuracy"],
      message: "La position GPS doit etre precise a 30 metres maximum.",
    });
  }
});

export type CreateSignalementInput = z.infer<typeof createSignalementSchema>;

export const trackingCodeSchema = z
  .string()
  .trim()
  .min(4)
  .max(30)
  .regex(/^[A-Z0-9-]+$/i, "Format de code de suivi invalide.");

export const updateStatusSchema = z.object({
  status: z.enum(STATUSES, {
    errorMap: () => ({ message: "Statut invalide." }),
  }),
});

export const addNoteSchema = z.object({
  note: cleanText(true).pipe(
    z
      .string()
      .min(1, "La note ne peut pas etre vide.")
      .max(2000, "La note est trop longue (2000 caracteres maximum).")
  ),
});

export const loginSchema = z.object({
  username: cleanText(false).pipe(
    z.string().min(1, "Identifiant requis.").max(64, "Identifiant trop long.")
  ),
  password: z
    .string()
    .min(1, "Mot de passe requis.")
    .max(128, "Mot de passe trop long."),
});

export const listFilterSchema = z.object({
  status: z.enum(STATUSES).optional(),
  category: z.enum(CATEGORIES).optional(),
  sort: z.enum(["date_desc", "date_asc"]).default("date_desc"),
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? stripControlChars(v, false) : v)),
});

const usernameSchema = cleanText(false).pipe(
  z
    .string()
    .min(3, "Identifiant trop court (3 caracteres minimum).")
    .max(32, "Identifiant trop long (32 caracteres maximum).")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "L'identifiant ne peut contenir que des lettres, chiffres, points, tirets ou underscores."
    )
);

const optionalPasswordSchema = z
  .string()
  .max(128, "Mot de passe trop long.")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined))
  .refine((v) => v === undefined || v.length >= 10, {
    message: "Le mot de passe doit contenir au moins 10 caracteres.",
  });

const requiredPasswordSchema = z
  .string()
  .min(10, "Le mot de passe doit contenir au moins 10 caracteres.")
  .max(128, "Mot de passe trop long.");

export const createAgentSchema = z.object({
  username: usernameSchema,
  fullName: cleanText(false).pipe(z.string().max(80, "Le nom est trop long.")),
  password: requiredPasswordSchema,
  role: z.enum(["agent", "admin"], {
    errorMap: () => ({ message: "Role invalide." }),
  }),
});

export const updateAgentSchema = z.object({
  fullName: cleanText(false).pipe(z.string().max(80, "Le nom est trop long.")),
  password: optionalPasswordSchema,
  role: z.enum(["agent", "admin"], {
    errorMap: () => ({ message: "Role invalide." }),
  }),
  active: z
    .union([z.literal("1"), z.literal("0"), z.literal("on"), z.undefined()])
    .transform((v) => v === "1" || v === "on"),
});

export const reassignSchema = z.object({
  assigned_service: z.enum(CATEGORIES, {
    errorMap: () => ({ message: "Service invalide." }),
  }),
  assigned_agent_id: z
    .union([z.string(), z.undefined(), z.null()])
    .transform((v) => {
      const value = String(v ?? "").trim();
      return value.length === 0 ? null : value;
    })
    .refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), {
      message: "Agent cible invalide.",
    }),
});

export type CreateAgentInput = z.infer<typeof createAgentSchema> & {
  specialties: import("../domain/categories").Category[];
};
export type UpdateAgentInput = z.infer<typeof updateAgentSchema> & {
  specialties: import("../domain/categories").Category[];
};

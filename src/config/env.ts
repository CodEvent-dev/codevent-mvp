/**
 * Chargement et validation centralisee des variables d'environnement.
 * Toute variable manquante ou invalide fait echouer le demarrage
 * immediatement, avec un message clair, plutot que de laisser
 * l'application tourner dans un etat mal configure (fail-fast).
 *
 * En production, des gardes supplementaires refusent les secrets
 * d'exemple et les mots de passe trop faibles.
 */
import path from "path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  COMMUNE_NAME: z.string().min(1).max(120).default("Ma Commune"),
  REFERENCE_CODE_PREFIX: z.string().min(2).max(10).regex(/^[A-Z0-9]+$/i).default("TIGY"),
  DB_PATH: z.string().min(1).default("./data/mairieconnect.db"),
  UPLOAD_DIR: z.string().min(1).default("./data/uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(15).default(8),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET doit contenir au moins 16 caracteres"),
  SESSION_MAX_AGE_HOURS: z.coerce.number().positive().max(24).default(8),
  ADMIN_DEFAULT_USERNAME: z.string().min(3).max(64).default("admin"),
  ADMIN_DEFAULT_PASSWORD: z.string().min(8).max(128).default("ChangeMoiImmediatement!2024"),
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(365),
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().max(5).default(0),
  COMMUNE_ADDRESS: z.string().trim().max(300).optional().default(""),
  COMMUNE_PHONE: z.string().trim().max(40).optional().default(""),
  COMMUNE_EMAIL: z.string().trim().max(120).optional().default(""),
  COMMUNE_SIREN: z.string().trim().max(20).optional().default(""),
  PUBLICATION_DIRECTOR: z.string().trim().max(160).optional().default(""),
  DPO_CONTACT: z.string().trim().max(200).optional().default(""),
  HOST_NAME: z.string().trim().max(160).optional().default(""),
  HOST_ADDRESS: z.string().trim().max(300).optional().default(""),
  HOST_PHONE: z.string().trim().max(40).optional().default(""),
  // Nom d'hote public (citoyens). Vide en local = pas de separation.
  PUBLIC_HOST: z.string().trim().toLowerCase().optional().default(""),
  // Nom d'hote interne (agents). /admin n'existe que sur cet hote.
  ADMIN_HOST: z.string().trim().toLowerCase().optional().default(""),
  // IP ou reseaux autorises sur l'hote admin (separes par des virgules).
  // Exemple : 10.0.0.0/8,192.168.1.0/24,203.0.113.8
  ADMIN_ALLOWED_IPS: z.string().optional().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuration invalide (.env). Details :");
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("Arret du serveur : variables d'environnement invalides.");
}

const IS_PRODUCTION = parsed.data.NODE_ENV === "production";

if (IS_PRODUCTION) {
  const weakSecrets = [
    "change_moi_avec_une_valeur_aleatoire_longue_et_secrete",
    "change_moi",
    "secret",
    "password",
  ];
  if (parsed.data.SESSION_SECRET.length < 32) {
    throw new Error(
      "Arret : en production, SESSION_SECRET doit faire au moins 32 caracteres (openssl rand -hex 32)."
    );
  }
  if (weakSecrets.some((s) => parsed.data.SESSION_SECRET.toLowerCase().includes(s))) {
    throw new Error("Arret : SESSION_SECRET de production trop previsible. Generez une valeur aleatoire.");
  }
  if (parsed.data.ADMIN_DEFAULT_PASSWORD === "ChangeMoiImmediatement!2024") {
    throw new Error(
      "Arret : changez ADMIN_DEFAULT_PASSWORD avant le deploiement en production."
    );
  }
  if (!parsed.data.ADMIN_HOST) {
    console.warn(
      "[MairieConnect] ADMIN_HOST est vide : l'espace agent reste joignable " +
        "sur la meme adresse que le site citoyen. Renseignez ADMIN_HOST et " +
        "ADMIN_ALLOWED_IPS avant d'ouvrir le service au public."
    );
  }
  if (!parsed.data.COMMUNE_ADDRESS || !parsed.data.HOST_NAME || !parsed.data.PUBLICATION_DIRECTOR) {
    console.warn(
      "[MairieConnect] Mentions legales incompletes : renseignez COMMUNE_ADDRESS, " +
        "PUBLICATION_DIRECTOR et HOST_NAME avant l'ouverture au public (LCEN)."
    );
  }
}

const root = process.cwd();

export const env = {
  ...parsed.data,
  ROOT_DIR: root,
  DB_PATH_ABS: path.resolve(root, parsed.data.DB_PATH),
  UPLOAD_DIR_ABS: path.resolve(root, parsed.data.UPLOAD_DIR),
  IS_PRODUCTION,
  SESSION_COOKIE_NAME: IS_PRODUCTION ? "__Host-mairieconnect" : "mairieconnect.sid",
  PUBLIC_HOST: parsed.data.PUBLIC_HOST.replace(/:\d+$/, ""),
  ADMIN_HOST: parsed.data.ADMIN_HOST.replace(/:\d+$/, ""),
  ADMIN_ALLOWED_IPS: parsed.data.ADMIN_ALLOWED_IPS.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0),
};

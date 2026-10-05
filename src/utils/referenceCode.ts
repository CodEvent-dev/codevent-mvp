/**
 * Generation du code de suivi citoyen (ex: "TIGY-8492").
 * Ce code est le SEUL identifiant que le citoyen doit conserver :
 * pas de compte, pas d'email obligatoire -> minimisation des donnees (RGPD).
 */
import crypto from "crypto";
import { env } from "../config/env";
import { db } from "../config/database";

/**
 * Genere un suffixe numerique a 4 chiffres cryptographiquement aleatoire.
 */
function randomFourDigits(): string {
  // crypto.randomInt est cryptographiquement sur et evite les biais modulo
  const value = crypto.randomInt(1000, 10000);
  return value.toString();
}

/**
 * Genere un code de suivi unique en base, avec le prefixe configure
 * (ex: TIGY-8492). Reessaie en cas de collision improbable.
 */
export function generateUniqueReferenceCode(): string {
  const checkStmt = db.prepare(
    "SELECT 1 FROM signalements WHERE reference_code = ? LIMIT 1"
  );

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${env.REFERENCE_CODE_PREFIX}-${randomFourDigits()}`;
    const existing = checkStmt.get(candidate);
    if (!existing) {
      return candidate;
    }
  }

  // Filet de securite extremement improbable : on ajoute un octet aleatoire supplementaire
  return `${env.REFERENCE_CODE_PREFIX}-${randomFourDigits()}${crypto.randomInt(0, 10)}`;
}

/**
 * Normalise une saisie de code de suivi (majuscules, espaces retires)
 * pour rendre la recherche tolerante a la saisie utilisateur.
 */
export function normalizeReferenceCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, "");
}

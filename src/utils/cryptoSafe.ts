/**
 * Comparaisons et controles cryptographiques "a temps constant"
 * pour eviter les fuites d'information par timing (CSRF, jetons).
 */
import crypto from "crypto";

/**
 * Compare deux chaines en temps constant. Si les longueurs different,
 * un comparatif factice est malgre tout execute pour ne pas divulguer
 * la longueur attendue par un simple ecart de latence.
 */
export function timingSafeEqualString(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

/** UUID v4 strict (format genere par crypto.randomUUID). */
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/** Nom de fichier photo autorise : UUID v4 + .jpg (jamais le nom d'origine). */
export const SAFE_PHOTO_FILENAME_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/i;

export function isSafePhotoFilename(name: string): boolean {
  return SAFE_PHOTO_FILENAME_REGEX.test(name);
}

/**
 * Echappe les jokers SQL LIKE (%, _, \\) pour qu'une recherche
 * utilisateur ne puisse pas elargir le motif au-dela du texte saisi.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Retire les caracteres de controle (sauf tab/newline utiles dans
 * les notes) afin d'eviter des injections dans les en-tetes ou logs.
 */
export function stripControlChars(input: string, allowNewlines = false): string {
  const pattern = allowNewlines ? /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g : /[\x00-\x1F\x7F]/g;
  return input.replace(pattern, "");
}

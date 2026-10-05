/**
 * Limiteurs de debit (anti brute-force / anti-spam), legers en CPU
 * (comptage en memoire, pas de dependance externe type Redis).
 */
import rateLimit from "express-rate-limit";

function jsonMessage(message: string) {
  return { error: message };
}

/** Limite les tentatives de connexion agent : 5 essais / 15 minutes / IP */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: jsonMessage(
    "Trop de tentatives de connexion. Merci de reessayer dans quelques minutes."
  ),
});

/** Limite la creation de signalements : 8 / heure / IP, pour eviter le spam */
export const createSignalementRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: jsonMessage(
    "Trop de signalements envoyes depuis cette connexion. Merci de reessayer plus tard."
  ),
});

/** Limite les recherches de suivi (enumeration de codes) */
export const trackingRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: jsonMessage("Trop de recherches. Merci de reessayer dans quelques minutes."),
});

/** Limite le geocodage inverse (appel au service public d'adresses) */
export const geocodeRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: jsonMessage("Trop de demandes de localisation. Merci de saisir l'adresse a la main."),
});

/** Limite generale anti-abus sur l'ensemble du site */
export const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
});

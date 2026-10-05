/**
 * Middleware central de gestion des erreurs. Objectifs :
 *  - Afficher des messages EXPLICITES EN FRANCAIS pour l'utilisateur.
 *  - Ne jamais divulguer de details techniques (stack trace, SQL...)
 *    au client, tout en les loggant cote serveur pour le diagnostic.
 */
import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError } from "../utils/AppError";
import { ZodError } from "zod";

function wantsJson(req: Request): boolean {
  return (
    req.headers.accept?.includes("application/json") === true ||
    req.path.startsWith("/api/")
  );
}

export function notFoundHandler(req: Request, res: Response): void {
  if (wantsJson(req)) {
    res.status(404).json({ error: "Ressource introuvable." });
    return;
  }
  res.status(404).render("public/404", { title: "Page introuvable" });
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = "Une erreur inattendue est survenue. Merci de reessayer.";

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = err.issues.map((issue) => issue.message).join(" ");
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    if (err.code === "LIMIT_FILE_SIZE") {
      message = "La photo envoyee est trop volumineuse.";
    } else {
      message = "Erreur lors de l'envoi du fichier.";
    }
  } else if (err instanceof Error && err.message === "FORMAT_IMAGE_NON_SUPPORTE") {
    statusCode = 400;
    message = "Format d'image non supporte. Envoyez une photo JPEG ou PNG.";
  } else if (err instanceof Error) {
    // Erreur inattendue : on ne divulgue jamais err.message brut (peut
    // contenir des details techniques/systeme) au client final.
    console.error("[MairieConnect] Erreur non geree :", err);
  }

  if (statusCode >= 500) {
    console.error("[MairieConnect] Erreur serveur :", err);
  }

  if (wantsJson(req)) {
    res.status(statusCode).json({ error: message });
    return;
  }

  res.status(statusCode).render("public/error", {
    title: "Erreur",
    message,
    statusCode,
  });
}

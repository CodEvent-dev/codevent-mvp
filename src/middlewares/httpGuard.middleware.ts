/**
 * Gardes HTTP complementaires a Helmet :
 *  - restriction des methodes (GET/HEAD/POST uniquement) ;
 *  - Cache-Control no-store sur les pages HTML (pas de cache proxy
 *    d'un tableau de bord agent ou d'un formulaire CSRF) ;
 *  - refus des en-tetes / corps polymorphes (tableaux) sur les champs
 *    critiques pour mitiger la pollution de parametres (HPP).
 */
import { Request, Response, NextFunction } from "express";

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST"]);

export function restrictHttpMethods(req: Request, res: Response, next: NextFunction): void {
  if (!ALLOWED_METHODS.has(req.method)) {
    res.setHeader("Allow", "GET, HEAD, POST");
    res.status(405).send("Methode HTTP non autorisee.");
    return;
  }
  next();
}

export function noStoreHtml(req: Request, res: Response, next: NextFunction): void {
  const path = req.path;
  const isStaticAsset =
    path.startsWith("/css/") ||
    path.startsWith("/js/") ||
    path.startsWith("/uploads/") ||
    path.endsWith(".svg") ||
    path.endsWith(".ico");

  if (!isStaticAsset) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }

  next();
}

/**
 * Si un champ de formulaire arrive en tableau (ex: ?username=a&username=b),
 * Express peut le transformer en array. On refuse plutot que de prendre
 * le premier silencieuxement (attaque HPP).
 */
export function rejectArrayParams(req: Request, res: Response, next: NextFunction): void {
  const inspect = (value: unknown): boolean => Array.isArray(value);

  for (const value of Object.values(req.query)) {
    if (inspect(value)) {
      res.status(400).send("Requete invalide.");
      return;
    }
  }

  if (req.body && typeof req.body === "object") {
    for (const value of Object.values(req.body as Record<string, unknown>)) {
      if (inspect(value)) {
        res.status(400).json({ error: "Requete invalide." });
        return;
      }
    }
  }

  next();
}

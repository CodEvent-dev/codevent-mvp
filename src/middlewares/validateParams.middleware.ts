/**
 * Validation stricte des identifiants dans l'URL (UUID v4).
 * Evite d'interroger la base avec des chaines arbitraires.
 */
import { Request, Response, NextFunction } from "express";
import { isUuidV4 } from "../utils/cryptoSafe";
import { AppError } from "../utils/AppError";

export function requireUuidParam(paramName: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const value = String(req.params[paramName] ?? "");
    if (!isUuidV4(value)) {
      next(new AppError("Identifiant de signalement invalide.", 400));
      return;
    }
    next();
  };
}

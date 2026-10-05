/**
 * Diffusion securisee des photos de signalement.
 * Les fichiers ne sont PAS exposes via express.static : un handler
 * dedie verifie le nom (UUID.jpg uniquement), resout le chemin et
 * refuse toute sortie du dossier d'upload (path traversal).
 *
 * En-tetes : nosniff, Content-Type image/jpeg force, pas d'execution.
 */
import fs from "fs";
import path from "path";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { isSafePhotoFilename } from "../utils/cryptoSafe";

export function serveSecurePhoto(req: Request, res: Response, next: NextFunction): void {
  const raw = String(req.params.filename ?? "");
  if (!isSafePhotoFilename(raw)) {
    res.status(404).end();
    return;
  }

  const resolved = path.resolve(env.UPLOAD_DIR_ABS, raw);
  const rootWithSep = env.UPLOAD_DIR_ABS.endsWith(path.sep)
    ? env.UPLOAD_DIR_ABS
    : env.UPLOAD_DIR_ABS + path.sep;

  if (resolved !== env.UPLOAD_DIR_ABS && !resolved.startsWith(rootWithSep)) {
    res.status(404).end();
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      res.status(404).end();
      return;
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, max-age=86400, immutable");
    res.sendFile(resolved, (sendErr) => {
      if (sendErr) next(sendErr);
    });
  });
}

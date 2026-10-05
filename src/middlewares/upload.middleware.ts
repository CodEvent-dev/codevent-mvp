/**
 * Configuration Multer pour la reception des photos de signalement.
 * Le fichier est garde EN MEMOIRE (memoryStorage) uniquement le temps
 * du traitement securise (voir upload.service.ts) : il n'est jamais
 * ecrit sur disque avec son contenu/nom d'origine, ce qui elimine tout
 * risque d'execution ou de traversee de chemin.
 */
import multer from "multer";
import { env } from "../config/env";

const ALLOWED_MIMETYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_MB * 1024 * 1024,
    files: 1,
    fields: 12,
    fieldSize: 8 * 1024,
    parts: 20,
  },
  fileFilter: (_req, file, callback) => {
    if (file.fieldname !== "photo") {
      callback(new Error("FORMAT_IMAGE_NON_SUPPORTE"));
      return;
    }
    if (!ALLOWED_MIMETYPES.has(file.mimetype)) {
      callback(new Error("FORMAT_IMAGE_NON_SUPPORTE"));
      return;
    }
    const original = (file.originalname || "").toLowerCase();
    if (original && !/\.(jpe?g|png|webp|gif)$/.test(original)) {
      callback(new Error("FORMAT_IMAGE_NON_SUPPORTE"));
      return;
    }
    callback(null, true);
  },
}).single("photo");

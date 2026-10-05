/**
 * Politique de conservation des donnees (RGPD).
 * Les signalements resolus ou rejetes depuis plus de DATA_RETENTION_DAYS
 * jours sont automatiquement anonymises : suppression de la photo, de
 * la description libre, des notes internes et des coordonnees precises,
 * tout en conservant les metadonnees statistiques (categorie, dates,
 * statut) utiles au suivi d'activite de la commune.
 *
 * Ce module peut etre :
 *  - execute a la demande par un agent depuis le tableau de bord,
 *  - execute automatiquement chaque nuit via node-cron (voir app.ts),
 *  - lance manuellement en CLI : `npm run purge:run`.
 */
import cron from "node-cron";
import { env } from "../config/env";
import { initDatabase } from "../config/database";
import {
  findExpiredForRetention,
  anonymizeSignalement,
} from "../models/signalement.model";
import { deletePhotoFile } from "./upload.service";

export interface PurgeResult {
  anonymizedCount: number;
}

export function runRetentionPurge(): PurgeResult {
  const expired = findExpiredForRetention(env.DATA_RETENTION_DAYS);

  for (const signalement of expired) {
    deletePhotoFile(signalement.photo_path);
    anonymizeSignalement(signalement.id);
  }

  if (expired.length > 0) {
    console.log(
      `[MairieConnect] Purge RGPD : ${expired.length} signalement(s) anonymise(s).`
    );
  }

  return { anonymizedCount: expired.length };
}

/**
 * Planifie la purge automatique tous les jours a 3h du matin (heure
 * creuse, faible impact sur les performances percues par les usagers).
 */
export function scheduleAutomaticPurge(): void {
  cron.schedule("0 3 * * *", () => {
    try {
      runRetentionPurge();
    } catch (error) {
      console.error("[MairieConnect] Erreur lors de la purge RGPD automatique :", error);
    }
  });
}

// Permet l'execution directe : `npm run purge:run`
if (require.main === module) {
  initDatabase();
  const result = runRetentionPurge();
  console.log(`Purge terminee. ${result.anonymizedCount} signalement(s) anonymise(s).`);
}

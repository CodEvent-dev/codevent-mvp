/**
 * Point d'entree du serveur MairieConnect.
 *
 * Vercel detecte Express ici : le fichier importe express et exporte
 * l'application (pas de listen). En local et derriere Apache/o2switch,
 * le meme fichier ecoute le port.
 */
import express from "express";
import { env } from "./config/env";
import { initDatabase } from "./config/database";
import { ensureDefaultAdminExists } from "./services/auth.service";
import { scheduleAutomaticPurge } from "./services/purge.service";
import { createApp } from "./app";

const onVercel = process.env.VERCEL === "1";

initDatabase();

const app = createApp();

if (!express.application) {
  throw new Error("Express n'a pas pu etre charge.");
}

export default app;

ensureDefaultAdminExists()
  .then(() => {
    if (onVercel) return;
    scheduleAutomaticPurge();
    app.listen(env.PORT, () => {
      console.log(
        `[MairieConnect] Serveur demarre sur http://localhost:${env.PORT} ` +
          `(environnement: ${env.NODE_ENV}, commune: ${env.COMMUNE_NAME})`
      );
    });
  })
  .catch((error) => {
    console.error("[MairieConnect] Echec du demarrage du serveur :", error);
    if (!onVercel) process.exit(1);
  });

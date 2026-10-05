/**
 * Point d'entree du serveur MairieConnect.
 * Initialise la base de donnees, le compte admin par defaut, la purge
 * RGPD automatique planifiee, puis demarre le serveur HTTP Express.
 *
 * En production, ce processus Node.js est place derriere Apache/Nginx
 * (reverse-proxy) qui gere le certificat HTTPS (cf. README.md, section
 * deploiement o2switch).
 */
import { env } from "./config/env";
import { initDatabase } from "./config/database";
import { ensureDefaultAdminExists } from "./services/auth.service";
import { scheduleAutomaticPurge } from "./services/purge.service";
import { createApp } from "./app";

async function bootstrap(): Promise<void> {
  initDatabase();
  await ensureDefaultAdminExists();
  scheduleAutomaticPurge();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(
      `[MairieConnect] Serveur demarre sur http://localhost:${env.PORT} ` +
        `(environnement: ${env.NODE_ENV}, commune: ${env.COMMUNE_NAME})`
    );
  });
}

bootstrap().catch((error) => {
  console.error("[MairieConnect] Echec du demarrage du serveur :", error);
  process.exit(1);
});

/**
 * Demarrage local et o2switch. Vercel charge src/app.ts directement
 * (il est detecte avant ce fichier) et utilise son export par defaut.
 */
import { env } from "./config/env";
import app, { whenReady } from "./app";

if (process.env.VERCEL !== "1") {
  whenReady
    .then(() => {
      app.listen(env.PORT, () => {
        console.log(
          `[MairieConnect] Serveur demarre sur http://localhost:${env.PORT} ` +
            `(environnement: ${env.NODE_ENV}, commune: ${env.COMMUNE_NAME})`
        );
      });
    })
    .catch((error) => {
      console.error("[MairieConnect] Echec du demarrage du serveur :", error);
      process.exit(1);
    });
}

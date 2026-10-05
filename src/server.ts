/**
 * Demarrage local et o2switch. Vercel n'utilise pas ce fichier :
 * il charge src/app.ts.
 */
import { env } from "./config/env";
import { boot } from "./expressApp";

if (process.env.VERCEL !== "1") {
  const app = boot();
  app.listen(env.PORT, () => {
    console.log(
      `[MairieConnect] Serveur demarre sur http://localhost:${env.PORT} ` +
        `(environnement: ${env.NODE_ENV}, commune: ${env.COMMUNE_NAME})`
    );
  });
}

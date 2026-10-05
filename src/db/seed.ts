/**
 * Script CLI d'initialisation : cree le schema et le compte admin par
 * defaut si necessaire. Utile pour preparer une base neuve avant le
 * premier demarrage du serveur (ex: `npm run db:seed`).
 */
import { initDatabase } from "../config/database";
import { ensureDefaultAdminExists } from "../services/auth.service";

async function main(): Promise<void> {
  initDatabase();
  await ensureDefaultAdminExists();
  console.log("[MairieConnect] Base de donnees initialisee avec succes.");
}

main().catch((error) => {
  console.error("[MairieConnect] Erreur lors de l'initialisation :", error);
  process.exit(1);
});

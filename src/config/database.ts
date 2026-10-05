/**
 * Connexion SQLite unique (singleton) partagee par toute l'application.
 *
 * Utilise le module natif `node:sqlite` (integre a Node.js depuis la
 * version 22.5, API synchrone stable en v24+) plutot qu'une dependance
 * npm tierce type "better-sqlite3" :
 *  - ZERO compilation native requise a l'installation (pas de node-gyp,
 *    pas de Visual Studio / build tools necessaires) -> deploiement
 *    o2switch simplifie et fiable quelle que soit la plateforme.
 *  - ZERO dependance supplementaire dans node_modules (Green IT).
 *  - Requetes preparees directes, aucune surcouche ORM.
 */
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { env } from "./env";
import { applySchemaMigrations } from "./migrate";

// S'assure que le dossier de la base de donnees existe (premier demarrage)
const dbDir = path.dirname(env.DB_PATH_ABS);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let dbInstance: DatabaseSync;

try {
  dbInstance = new DatabaseSync(env.DB_PATH_ABS);

  // Reglages recommandes pour une utilisation web concurrente legere :
  // WAL = meilleure concurrence lecture/ecriture, foreign_keys = integrite.
  dbInstance.exec("PRAGMA journal_mode = WAL;");
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbInstance.exec("PRAGMA synchronous = NORMAL;");
  dbInstance.exec("PRAGMA busy_timeout = 5000;");
  dbInstance.exec("PRAGMA temp_store = MEMORY;");
} catch (error) {
  console.error(
    `[MairieConnect] Echec de connexion a la base de donnees SQLite (${env.DB_PATH_ABS}). ` +
      "Verifiez que le dossier existe et que l'application a les droits d'ecriture necessaires."
  );
  throw error;
}

export const db = dbInstance;

/**
 * Initialise le schema (idempotent, "CREATE TABLE IF NOT EXISTS").
 * Appele explicitement au demarrage du serveur.
 */
export function initDatabase(): void {
  // Le fichier .sql est un asset source : on le lit toujours depuis
  // src/db (non transpile par tsc) via la racine du projet, que l'on
  // execute en dev (tsx) ou en prod (dist/server.js).
  if (!fs.existsSync(env.UPLOAD_DIR_ABS)) {
    fs.mkdirSync(env.UPLOAD_DIR_ABS, { recursive: true });
  }
  const schemaPath = path.resolve(env.ROOT_DIR, "src", "db", "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  applySchemaMigrations(db);
}

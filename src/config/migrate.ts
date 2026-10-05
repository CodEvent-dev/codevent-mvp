/**
 * Migrations idempotentes pour les bases deja creees avant le
 * routage par specialite. `schema.sql` utilise CREATE TABLE IF NOT
 * EXISTS : les colonnes nouvelles n'apparaissent pas toutes seules
 * sur une base existante. On les ajoute ici via PRAGMA table_info.
 */
import { DatabaseSync } from "node:sqlite";

function columnNames(database: DatabaseSync, table: string): Set<string> {
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

function ensureColumn(
  database: DatabaseSync,
  table: string,
  name: string,
  definition: string
): void {
  if (columnNames(database, table).has(name)) return;
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

/**
 * Applique le delta de schema (agents.active, colonnes de routage,
 * index de cloisonnement). Sans-op si tout est deja en place.
 */
export function applySchemaMigrations(database: DatabaseSync): void {
  ensureColumn(database, "agents", "active", "active INTEGER NOT NULL DEFAULT 1");

  ensureColumn(database, "signalements", "assigned_service", "assigned_service TEXT");
  ensureColumn(database, "signalements", "assigned_agent_id", "assigned_agent_id TEXT");
  ensureColumn(database, "signalements", "routing_score", "routing_score REAL");
  ensureColumn(database, "signalements", "routing_reason", "routing_reason TEXT");
  ensureColumn(database, "signalements", "routing_source", "routing_source TEXT");
  ensureColumn(database, "signalements", "routed_at", "routed_at TEXT");

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_signalements_assigned_service
      ON signalements (assigned_service);
    CREATE INDEX IF NOT EXISTS idx_signalements_assigned_agent
      ON signalements (assigned_agent_id);
  `);

  // Tickets historiques : le service assigne = la categorie citoyenne.
  database.exec(`
    UPDATE signalements
    SET assigned_service = category
    WHERE assigned_service IS NULL AND category IS NOT NULL
  `);
}

/**
 * Couche d'acces aux donnees pour les signalements.
 * Uniquement des requetes SQL preparees et directes (module natif
 * node:sqlite), pas d'ORM : performances maximales, empreinte memoire
 * minimale, et aucune dependance native a compiler.
 * Toutes les requetes utilisent des parametres lies -> aucune
 * concatenation de chaine -> protection native contre l'injection SQL.
 */
import crypto from "crypto";
import { db } from "../config/database";
import { generateUniqueReferenceCode } from "../utils/referenceCode";
import { escapeLikePattern } from "../utils/cryptoSafe";

export type SignalementStatus =
  | "nouveau"
  | "pris_en_compte"
  | "en_cours"
  | "resolu"
  | "rejete";

export type RoutingSource = "citizen" | "ai" | "manual";

export interface Signalement {
  id: string;
  reference_code: string;
  category: string;
  description: string | null;
  photo_path: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string;
  status: SignalementStatus;
  created_at: string;
  updated_at: string;
  internal_notes: string | null;
  anonymized: number;
  reporter_ip_hash: string | null;
  assigned_service: string | null;
  assigned_agent_id: string | null;
  routing_score: number | null;
  routing_reason: string | null;
  routing_source: RoutingSource | null;
  routed_at: string | null;
  assigned_agent_username?: string | null;
}

export interface CreateSignalementParams {
  category: string;
  description: string;
  address: string;
  latitude?: number;
  longitude?: number;
  photoPath: string | null;
  reporterIpHash: string;
  assignedService: string;
  assignedAgentId: string | null;
  routingScore: number;
  routingReason: string;
  routingSource: RoutingSource;
}

export interface ListFilters {
  status?: string;
  category?: string;
  sort: "date_desc" | "date_asc";
  q?: string;
  /** Si defini, cloisonne le resultat aux services de l'agent. */
  allowedServices?: string[];
}

const nowIso = () => new Date().toISOString();

/**
 * Cree un nouveau signalement et retourne son code de suivi.
 */
export function createSignalement(params: CreateSignalementParams): Signalement {
  const id = crypto.randomUUID();
  const referenceCode = generateUniqueReferenceCode();
  const timestamp = nowIso();

  const stmt = db.prepare(`
    INSERT INTO signalements (
      id, reference_code, category, description, photo_path,
      latitude, longitude, address, status, created_at, updated_at,
      internal_notes, anonymized, reporter_ip_hash,
      assigned_service, assigned_agent_id, routing_score,
      routing_reason, routing_source, routed_at
    ) VALUES (
      @id, @reference_code, @category, @description, @photo_path,
      @latitude, @longitude, @address, 'nouveau', @created_at, @updated_at,
      NULL, 0, @reporter_ip_hash,
      @assigned_service, @assigned_agent_id, @routing_score,
      @routing_reason, @routing_source, @routed_at
    )
  `);

  stmt.run({
    id,
    reference_code: referenceCode,
    category: params.category,
    description: params.description || null,
    photo_path: params.photoPath,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    address: params.address,
    created_at: timestamp,
    updated_at: timestamp,
    reporter_ip_hash: params.reporterIpHash,
    assigned_service: params.assignedService,
    assigned_agent_id: params.assignedAgentId,
    routing_score: params.routingScore,
    routing_reason: params.routingReason,
    routing_source: params.routingSource,
    routed_at: timestamp,
  });

  return getSignalementById(id) as Signalement;
}

const SIGNALEMENT_SELECT = `
  SELECT s.*, a.username AS assigned_agent_username
  FROM signalements s
  LEFT JOIN agents a ON a.id = s.assigned_agent_id
`;

export function getSignalementById(id: string): Signalement | undefined {
  return db
    .prepare(`${SIGNALEMENT_SELECT} WHERE s.id = ?`)
    .get(id) as Signalement | undefined;
}

/**
 * Recherche publique par code de suivi (retourne uniquement les
 * champs necessaires a l'affichage citoyen ; les notes internes ne
 * doivent JAMAIS transiter par cette fonction).
 */
export function getSignalementByReferenceCode(
  referenceCode: string
): Signalement | undefined {
  return db
    .prepare("SELECT * FROM signalements WHERE reference_code = ?")
    .get(referenceCode) as Signalement | undefined;
}

/**
 * Liste les signalements pour le tableau de bord agent, avec filtres
 * optionnels par statut/categorie, recherche texte simple, et tri par date.
 * Utilise les index dedies (idx_signalements_status/category/created_at).
 */
export function listSignalements(filters: ListFilters): Signalement[] {
  const conditions: string[] = [];
  const bindings: Record<string, string> = {};

  if (filters.status) {
    conditions.push("s.status = @status");
    bindings.status = filters.status;
  }
  if (filters.category) {
    conditions.push("COALESCE(s.assigned_service, s.category) = @category");
    bindings.category = filters.category;
  }
  if (filters.q) {
    conditions.push(
      "(s.reference_code LIKE @q ESCAPE '\\' OR s.address LIKE @q ESCAPE '\\' OR s.description LIKE @q ESCAPE '\\')"
    );
    bindings.q = `%${escapeLikePattern(filters.q)}%`;
  }
  if (filters.allowedServices) {
    if (filters.allowedServices.length === 0) {
      return [];
    }
    const placeholders = filters.allowedServices.map((_, index) => {
      const key = `svc${index}`;
      bindings[key] = filters.allowedServices![index];
      return `@${key}`;
    });
    conditions.push(
      `COALESCE(s.assigned_service, s.category) IN (${placeholders.join(", ")})`
    );
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderClause =
    filters.sort === "date_asc" ? "ORDER BY s.created_at ASC" : "ORDER BY s.created_at DESC";

  const query = `${SIGNALEMENT_SELECT} ${whereClause} ${orderClause}`;
  return db.prepare(query).all(bindings) as unknown as Signalement[];
}

/**
 * Statistiques agregees pour les cartes du tableau de bord.
 * Une seule requete GROUP BY : couteux minimal, pas de N requetes.
 */
export function getStatsByStatus(
  allowedServices?: string[]
): Record<SignalementStatus, number> {
  let rows: { status: SignalementStatus; count: number }[];

  if (allowedServices) {
    if (allowedServices.length === 0) {
      rows = [];
    } else {
      const bindings: Record<string, string> = {};
      const placeholders = allowedServices.map((service, index) => {
        const key = `svc${index}`;
        bindings[key] = service;
        return `@${key}`;
      });
      rows = db
        .prepare(
          `SELECT status, COUNT(*) as count FROM signalements
           WHERE COALESCE(assigned_service, category) IN (${placeholders.join(", ")})
           GROUP BY status`
        )
        .all(bindings) as { status: SignalementStatus; count: number }[];
    }
  } else {
    rows = db
      .prepare("SELECT status, COUNT(*) as count FROM signalements GROUP BY status")
      .all() as { status: SignalementStatus; count: number }[];
  }

  const stats: Record<SignalementStatus, number> = {
    nouveau: 0,
    pris_en_compte: 0,
    en_cours: 0,
    resolu: 0,
    rejete: 0,
  };

  for (const row of rows) {
    stats[row.status] = row.count;
  }

  return stats;
}

export function updateStatus(id: string, status: SignalementStatus): void {
  db.prepare(
    "UPDATE signalements SET status = ?, updated_at = ? WHERE id = ?"
  ).run(status, nowIso(), id);
}

export function updateCoordinates(id: string, latitude: number, longitude: number): void {
  db.prepare(
    "UPDATE signalements SET latitude = ?, longitude = ? WHERE id = ?"
  ).run(latitude, longitude, id);
}

export function updateAssignment(
  id: string,
  params: {
    assignedService: string;
    assignedAgentId: string | null;
    routingReason: string;
    routingSource: RoutingSource;
  }
): void {
  db.prepare(
    `UPDATE signalements
     SET assigned_service = ?,
         assigned_agent_id = ?,
         routing_reason = ?,
         routing_source = ?,
         routed_at = ?,
         updated_at = ?
     WHERE id = ?`
  ).run(
    params.assignedService,
    params.assignedAgentId,
    params.routingReason,
    params.routingSource,
    nowIso(),
    nowIso(),
    id
  );
}

/**
 * Ajoute une entree horodatee au journal de notes internes (append-only),
 * sans jamais exposer ce champ au citoyen (voir controllers publics).
 */
export function appendInternalNote(
  id: string,
  note: string,
  authorUsername: string
): void {
  const current = getSignalementById(id);
  if (!current) return;

  const entry = `[${new Date().toLocaleString("fr-FR")}] ${authorUsername} : ${note}`;
  const updatedNotes = current.internal_notes
    ? `${current.internal_notes}\n${entry}`
    : entry;

  db.prepare(
    "UPDATE signalements SET internal_notes = ?, updated_at = ? WHERE id = ?"
  ).run(updatedNotes, nowIso(), id);
}

/**
 * Signalements resolus/rejetes depuis plus de `retentionDays` et pas
 * encore anonymises : cible de la purge RGPD automatique.
 */
export function findExpiredForRetention(retentionDays: number): Signalement[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  return db
    .prepare(
      `SELECT * FROM signalements
       WHERE status IN ('resolu', 'rejete')
         AND anonymized = 0
         AND updated_at <= ?`
    )
    .all(cutoff.toISOString()) as unknown as Signalement[];
}

/**
 * Anonymise un signalement : supprime les donnees a caractere personnel
 * ou sensible (photo, description libre, notes internes) tout en
 * conservant les metadonnees statistiques (categorie, dates, statut).
 */
export function anonymizeSignalement(id: string): void {
  db.prepare(
    `UPDATE signalements
     SET description = NULL,
         photo_path = NULL,
         internal_notes = NULL,
         address = 'Anonymise',
         latitude = NULL,
         longitude = NULL,
         reporter_ip_hash = NULL,
         anonymized = 1,
         updated_at = ?
     WHERE id = ?`
  ).run(nowIso(), id);
}

export function countAll(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM signalements").get() as {
    count: number;
  };
  return row.count;
}

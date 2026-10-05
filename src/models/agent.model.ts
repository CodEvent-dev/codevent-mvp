/**
 * Couche d'acces aux donnees pour les comptes agents (espace prive)
 * et leurs specialites de service.
 */
import crypto from "crypto";
import { db } from "../config/database";
import { Category, isCategory } from "../domain/categories";

export interface Agent {
  id: string;
  username: string;
  password_hash: string;
  full_name: string | null;
  role: "agent" | "admin";
  active: number;
  created_at: string;
  last_login_at: string | null;
}

export interface AgentListItem extends Agent {
  specialties: Category[];
  openTickets: number;
}

export interface SpecialistCandidate {
  id: string;
  username: string;
  openTickets: number;
}

export function getAgentByUsername(username: string): Agent | undefined {
  return db
    .prepare("SELECT * FROM agents WHERE username = ?")
    .get(username) as Agent | undefined;
}

export function getAgentById(id: string): Agent | undefined {
  return db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as
    | Agent
    | undefined;
}

export function countAgents(): number {
  const row = db.prepare("SELECT COUNT(*) as count FROM agents").get() as {
    count: number;
  };
  return row.count;
}

export function countActiveAdmins(): number {
  const row = db
    .prepare("SELECT COUNT(*) as count FROM agents WHERE role = 'admin' AND active = 1")
    .get() as { count: number };
  return row.count;
}

export function createAgent(params: {
  username: string;
  passwordHash: string;
  fullName?: string;
  role?: "agent" | "admin";
  active?: boolean;
}): Agent {
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO agents (id, username, password_hash, full_name, role, active)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.username,
    params.passwordHash,
    params.fullName ?? null,
    params.role ?? "agent",
    params.active === false ? 0 : 1
  );
  return getAgentById(id) as Agent;
}

export function updateAgent(params: {
  id: string;
  fullName: string | null;
  role: "agent" | "admin";
  active: boolean;
  passwordHash?: string;
}): void {
  if (params.passwordHash) {
    db.prepare(
      `UPDATE agents
       SET full_name = ?, role = ?, active = ?, password_hash = ?
       WHERE id = ?`
    ).run(params.fullName, params.role, params.active ? 1 : 0, params.passwordHash, params.id);
    return;
  }

  db.prepare(
    `UPDATE agents SET full_name = ?, role = ?, active = ? WHERE id = ?`
  ).run(params.fullName, params.role, params.active ? 1 : 0, params.id);
}

export function touchLastLogin(id: string): void {
  db.prepare("UPDATE agents SET last_login_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id
  );
}

export function listAgentSpecialties(agentId: string): Category[] {
  const rows = db
    .prepare("SELECT category FROM agent_specialties WHERE agent_id = ? ORDER BY category")
    .all(agentId) as { category: string }[];
  return rows.map((row) => row.category).filter(isCategory);
}

export function replaceAgentSpecialties(agentId: string, categories: Category[]): void {
  const unique = [...new Set(categories)].filter(isCategory);
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM agent_specialties WHERE agent_id = ?").run(agentId);
    const insert = db.prepare(
      "INSERT INTO agent_specialties (agent_id, category) VALUES (?, ?)"
    );
    for (const category of unique) {
      insert.run(agentId, category);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listAgents(): Agent[] {
  return db
    .prepare("SELECT * FROM agents ORDER BY role DESC, username ASC")
    .all() as unknown as Agent[];
}

export function listAgentsWithSpecialties(): AgentListItem[] {
  const agents = listAgents();
  const specialtyRows = db
    .prepare("SELECT agent_id, category FROM agent_specialties")
    .all() as { agent_id: string; category: string }[];
  const openRows = db
    .prepare(
      `SELECT assigned_agent_id as id, COUNT(*) as count
       FROM signalements
       WHERE assigned_agent_id IS NOT NULL
         AND status IN ('nouveau', 'pris_en_compte', 'en_cours')
       GROUP BY assigned_agent_id`
    )
    .all() as { id: string; count: number }[];

  const specialtiesByAgent = new Map<string, Category[]>();
  for (const row of specialtyRows) {
    if (!isCategory(row.category)) continue;
    const current = specialtiesByAgent.get(row.agent_id) ?? [];
    current.push(row.category);
    specialtiesByAgent.set(row.agent_id, current);
  }

  const openByAgent = new Map(openRows.map((row) => [row.id, row.count]));

  return agents.map((agent) => ({
    ...agent,
    specialties: specialtiesByAgent.get(agent.id) ?? [],
    openTickets: openByAgent.get(agent.id) ?? 0,
  }));
}

/**
 * Agent operationnel le moins charge pour un service donne.
 * Les administrateurs ne sont pas dans le pool : ils ont la vue
 * globale, pas la file d'intervention quotidienne.
 */
export function pickLeastLoadedSpecialist(service: string): SpecialistCandidate | null {
  const row = db
    .prepare(
      `SELECT a.id, a.username,
              (
                SELECT COUNT(*)
                FROM signalements s
                WHERE s.assigned_agent_id = a.id
                  AND s.status IN ('nouveau', 'pris_en_compte', 'en_cours')
              ) AS openTickets
       FROM agents a
       INNER JOIN agent_specialties sp ON sp.agent_id = a.id
       WHERE a.role = 'agent'
         AND a.active = 1
         AND sp.category = ?
       ORDER BY openTickets ASC, a.username ASC
       LIMIT 1`
    )
    .get(service) as SpecialistCandidate | undefined;

  return row ?? null;
}

export function listSpecialistsForService(service: string): SpecialistCandidate[] {
  return db
    .prepare(
      `SELECT a.id, a.username, 0 AS openTickets
       FROM agents a
       INNER JOIN agent_specialties sp ON sp.agent_id = a.id
       WHERE a.active = 1 AND sp.category = ?
       ORDER BY a.username ASC`
    )
    .all(service) as unknown as SpecialistCandidate[];
}

export function listAssignableAgents(): SpecialistCandidate[] {
  return db
    .prepare(
      `SELECT id, username, 0 AS openTickets
       FROM agents
       WHERE active = 1 AND role = 'agent'
       ORDER BY username ASC`
    )
    .all() as unknown as SpecialistCandidate[];
}

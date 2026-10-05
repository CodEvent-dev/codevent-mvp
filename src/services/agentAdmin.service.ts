/**
 * Gestion des comptes agents et de leurs specialites.
 * Reserve aux administrateurs. Les mots de passe transitent uniquement
 * par bcrypt ; aucune specialite n'est acceptee hors catalogue.
 */
import {
  countActiveAdmins,
  createAgent,
  getAgentById,
  getAgentByUsername,
  listAgentsWithSpecialties,
  replaceAgentSpecialties,
  updateAgent,
  AgentListItem,
} from "../models/agent.model";
import { hashPassword } from "./auth.service";
import { CreateAgentInput, UpdateAgentInput } from "../utils/validators";
import { AppError } from "../utils/AppError";
import { Category } from "../domain/categories";

export function listManagedAgents(): AgentListItem[] {
  return listAgentsWithSpecialties();
}

function assertSpecialtiesForRole(role: "agent" | "admin", specialties: Category[]): void {
  if (role === "agent" && specialties.length === 0) {
    throw new AppError(
      "Un agent doit etre rattache a au moins un service (voirie, eclairage, etc.).",
      400
    );
  }
}

export async function createManagedAgent(input: CreateAgentInput): Promise<void> {
  assertSpecialtiesForRole(input.role, input.specialties);

  if (getAgentByUsername(input.username)) {
    throw new AppError("Cet identifiant est deja utilise.", 409);
  }

  const passwordHash = await hashPassword(input.password);
  const agent = createAgent({
    username: input.username,
    passwordHash,
    fullName: input.fullName || undefined,
    role: input.role,
  });
  replaceAgentSpecialties(agent.id, input.specialties);
}

export async function updateManagedAgent(
  id: string,
  input: UpdateAgentInput,
  actorId: string
): Promise<void> {
  const existing = getAgentById(id);
  if (!existing) {
    throw new AppError("Ce compte agent n'existe pas.", 404);
  }

  assertSpecialtiesForRole(input.role, input.specialties);

  const wouldDisableLastAdmin =
    existing.role === "admin" &&
    existing.active === 1 &&
    (input.role !== "admin" || !input.active) &&
    countActiveAdmins() <= 1;

  if (wouldDisableLastAdmin) {
    throw new AppError("Impossible de retirer le dernier administrateur actif.", 400);
  }

  if (existing.id === actorId && !input.active) {
    throw new AppError("Vous ne pouvez pas desactiver votre propre compte.", 400);
  }

  let passwordHash: string | undefined;
  if (input.password) {
    passwordHash = await hashPassword(input.password);
  }

  updateAgent({
    id,
    fullName: input.fullName || null,
    role: input.role,
    active: input.active,
    passwordHash,
  });
  replaceAgentSpecialties(id, input.specialties);
}

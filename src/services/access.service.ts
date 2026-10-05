/**
 * Cloisonnement des roles dans le back-office.
 * - admin / maire : vue globale, gestion des comptes.
 * - agent : uniquement les tickets dont le service assigne
 *   appartient a ses specialites.
 */
import { Category, isCategory } from "../domain/categories";
import { Signalement } from "../models/signalement.model";
import { AppError } from "../utils/AppError";

export interface AgentAccess {
  id: string;
  username: string;
  fullName: string | null;
  role: "agent" | "admin";
  specialties: Category[];
}

export function isGlobalViewer(access: AgentAccess): boolean {
  return access.role === "admin";
}

export function visibleServices(access: AgentAccess): string[] | undefined {
  if (isGlobalViewer(access)) return undefined;
  return access.specialties;
}

export function signalementService(signalement: Signalement): string {
  return signalement.assigned_service || signalement.category;
}

export function canAccessSignalement(access: AgentAccess, signalement: Signalement): boolean {
  if (isGlobalViewer(access)) return true;
  return access.specialties.includes(signalementService(signalement) as Category);
}

export function assertCanAccessSignalement(
  access: AgentAccess,
  signalement: Signalement
): void {
  if (canAccessSignalement(access, signalement)) return;
  throw new AppError("Ce signalement n'appartient pas a votre service.", 403);
}

export function parseSpecialtyFlags(body: Record<string, unknown>): Category[] {
  const selected: Category[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (!key.startsWith("specialty_")) continue;
    if (value !== "1" && value !== "on" && value !== true) continue;
    const category = key.slice("specialty_".length);
    if (isCategory(category)) selected.push(category);
  }
  return selected;
}

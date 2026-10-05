/**
 * Logique metier des signalements : orchestre la validation, le
 * traitement de photo et l'acces aux donnees. Separe clairement ce
 * qui est expose au public de ce qui est reserve aux agents.
 */
import crypto from "crypto";
import {
  createSignalement as createSignalementInDb,
  getSignalementByReferenceCode,
  listSignalements,
  getStatsByStatus,
  updateStatus as updateStatusInDb,
  appendInternalNote,
  getSignalementById,
  updateCoordinates,
  updateAssignment,
  Signalement,
  ListFilters,
} from "../models/signalement.model";
import { processAndStorePhoto, deletePhotoFile } from "./upload.service";
import { CreateSignalementInput } from "../utils/validators";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { normalizeReferenceCode } from "../utils/referenceCode";
import { isUuidV4 } from "../utils/cryptoSafe";
import { forwardGeocode, isUsableCoordinate } from "./geocode.service";
import { routeIncomingTicket } from "./routing/router.service";
import { ImageColorProfile } from "./routing/imageHints";
import { AgentAccess, assertCanAccessSignalement, visibleServices } from "./access.service";
import { getAgentById, listAgentSpecialties } from "../models/agent.model";
import { categoryShortLabel } from "../domain/categories";

/**
 * HMAC-SHA256 de l'IP (jamais stockee en clair). Le secret de session
 * sert de poivre : un dump de la base ne permet pas de reinverser
 * l'empreinte sans ce secret.
 */
function hashIp(ip: string): string {
  return crypto.createHmac("sha256", env.SESSION_SECRET).update(ip).digest("hex");
}

export interface CreateSignalementResult {
  referenceCode: string;
}

export async function createPublicSignalement(
  input: CreateSignalementInput,
  photoBuffer: Buffer | null,
  clientIp: string
): Promise<CreateSignalementResult> {
  let photoPath: string | null = null;
  let imageProfile: ImageColorProfile | null = null;

  if (photoBuffer) {
    const stored = await processAndStorePhoto(photoBuffer);
    photoPath = stored.path;
    imageProfile = stored.colorProfile;
  }

  const precision = input.other_precision?.trim() ?? "";
  const freeText = input.description?.trim() ?? "";
  let description = freeText;
  if (input.category === "autre" && precision) {
    description = freeText
      ? `Precision : ${precision}\n${freeText}`
      : `Precision : ${precision}`;
  }

  const hasPreciseGps = isUsableCoordinate(input.latitude, input.longitude);
  let latitude = hasPreciseGps ? input.latitude : undefined;
  let longitude = hasPreciseGps ? input.longitude : undefined;

  if (!hasPreciseGps) {
    const located = await forwardGeocode(input.address);
    if (located) {
      latitude = located.latitude;
      longitude = located.longitude;
    }
  }

  const routing = routeIncomingTicket({
    citizenCategory: input.category,
    description,
    address: input.address,
    imageProfile,
  });

  const signalement = createSignalementInDb({
    category: input.category,
    description,
    address: input.address,
    latitude,
    longitude,
    photoPath,
    reporterIpHash: hashIp(clientIp),
    assignedService: routing.service,
    assignedAgentId: routing.assignedAgentId,
    routingScore: routing.score,
    routingReason: routing.reason,
    routingSource: routing.source,
  });

  return { referenceCode: signalement.reference_code };
}

/**
 * Recherche publique d'un signalement par code de suivi. Ne retourne
 * QUE les champs necessaires a l'affichage citoyen : les notes
 * internes et le hash IP restent invisibles depuis cette fonction.
 */
export interface PublicSignalementView {
  referenceCode: string;
  category: string;
  address: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  photoPath: string | null;
  description: string | null;
}

export function findPublicSignalementByCode(
  rawCode: string
): PublicSignalementView | null {
  const code = normalizeReferenceCode(rawCode);
  const signalement = getSignalementByReferenceCode(code);

  if (!signalement) return null;

  return {
    referenceCode: signalement.reference_code,
    category: signalement.category,
    address: signalement.address,
    status: signalement.status,
    createdAt: signalement.created_at,
    updatedAt: signalement.updated_at,
    photoPath: signalement.photo_path,
    description: signalement.description,
  };
}

export function listForDashboard(filters: ListFilters, access: AgentAccess): Signalement[] {
  return listSignalements({
    ...filters,
    allowedServices: visibleServices(access),
  });
}

export function getDashboardStats(access: AgentAccess) {
  return getStatsByStatus(visibleServices(access));
}

export function getSignalementDetail(id: string, access: AgentAccess): Signalement {
  if (!isUuidV4(id)) {
    throw new AppError("Identifiant de signalement invalide.", 400);
  }
  const signalement = getSignalementById(id);
  if (!signalement) {
    throw new AppError("Ce signalement n'existe pas ou a ete supprime.", 404);
  }
  assertCanAccessSignalement(access, signalement);
  return signalement;
}

/**
 * Si l'adresse a ete saisie a la main, les coordonnees peuvent etre
 * vides ou a 0,0. On les deduit alors de l'adresse et on les enregistre.
 */
export async function withResolvedCoordinates(signalement: Signalement): Promise<Signalement> {
  if (isUsableCoordinate(signalement.latitude, signalement.longitude)) {
    return signalement;
  }
  if (signalement.anonymized) return signalement;

  const located = await forwardGeocode(signalement.address);
  if (!located) {
    return { ...signalement, latitude: null, longitude: null };
  }

  updateCoordinates(signalement.id, located.latitude, located.longitude);
  return {
    ...signalement,
    latitude: located.latitude,
    longitude: located.longitude,
  };
}

export function changeSignalementStatus(
  id: string,
  status: Signalement["status"],
  access: AgentAccess
): void {
  if (!isUuidV4(id)) {
    throw new AppError("Identifiant de signalement invalide.", 400);
  }
  const existing = getSignalementById(id);
  if (!existing) {
    throw new AppError("Ce signalement n'existe pas ou a ete supprime.", 404);
  }
  assertCanAccessSignalement(access, existing);
  updateStatusInDb(id, status);
}

export function addInternalNoteToSignalement(
  id: string,
  note: string,
  authorUsername: string,
  access: AgentAccess
): void {
  if (!isUuidV4(id)) {
    throw new AppError("Identifiant de signalement invalide.", 400);
  }
  const existing = getSignalementById(id);
  if (!existing) {
    throw new AppError("Ce signalement n'existe pas ou a ete supprime.", 404);
  }
  assertCanAccessSignalement(access, existing);
  appendInternalNote(id, note, authorUsername);
}

export function reassignSignalement(
  id: string,
  assignedService: string,
  assignedAgentId: string | null,
  access: AgentAccess
): void {
  if (access.role !== "admin") {
    throw new AppError("Seul un administrateur peut reaffecter un ticket.", 403);
  }
  if (!isUuidV4(id)) {
    throw new AppError("Identifiant de signalement invalide.", 400);
  }
  const existing = getSignalementById(id);
  if (!existing) {
    throw new AppError("Ce signalement n'existe pas ou a ete supprime.", 404);
  }

  if (assignedAgentId) {
    const agent = getAgentById(assignedAgentId);
    if (!agent || agent.active !== 1) {
      throw new AppError("L'agent cible est introuvable ou inactif.", 400);
    }
    if (agent.role === "agent") {
      const specialties = listAgentSpecialties(agent.id);
      if (!specialties.includes(assignedService as typeof specialties[number])) {
        throw new AppError("Cet agent n'est pas rattache au service choisi.", 400);
      }
    }
  }

  const actor = access.fullName || access.username;
  updateAssignment(id, {
    assignedService,
    assignedAgentId,
    routingSource: "manual",
    routingReason: `Reaffectation manuelle par ${actor} vers ${categoryShortLabel(assignedService)}.`,
  });
}

export { deletePhotoFile };

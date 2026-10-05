/**
 * Routeur intelligent local des signalements.
 *
 * Algorithme (deterministe, 100 % on-premise) :
 *  1. Classer le texte (description + precision "Autre" + adresse)
 *     via un lexique municipal pondere.
 *  2. Ajouter un leger bonus visuel si une photo est jointe
 *     (dominantes couleur, pas de vision cloud).
 *  3. Injecter un prior citoyen : si l'usager a choisi un service
 *     precis, ce choix pèse lourd ; "Autre" laisse l'IA decider.
 *  4. Retenir le service au plus fort score. Si le score est trop
 *     faible et que le citoyen a dit "Autre", on reste sur "autre".
 *  5. Designer l'agent specialiste le moins charge (tickets ouverts).
 *     Pas d'e-mail : l'affectation apparait dans le tableau de bord.
 *
 * Aucune donnee ne sort du serveur. La decision est journalisee
 * (routing_reason) pour rester auditable.
 */
import { Category, categoryShortLabel, SERVICE_CATEGORIES } from "../../domain/categories";
import { pickLeastLoadedSpecialist } from "../../models/agent.model";
import { ImageColorProfile, describeImageHints, imageHintScores } from "./imageHints";
import {
  classifyText,
  isOperationalService,
  leadingService,
  ServiceScores,
  topEvidence,
} from "./textClassifier";

const CITIZEN_PRIOR = 3.2;
const MIN_AI_SCORE = 1.15;

export type RoutingSource = "citizen" | "ai" | "manual";

export interface RoutingDecision {
  service: Category;
  assignedAgentId: string | null;
  assignedAgentUsername: string | null;
  score: number;
  source: RoutingSource;
  reason: string;
}

export interface RouteTicketInput {
  citizenCategory: Category;
  description: string;
  address: string;
  imageProfile?: ImageColorProfile | null;
}

function sumScores(left: ServiceScores, right: ServiceScores): ServiceScores {
  return {
    voirie: left.voirie + right.voirie,
    eclairage: left.eclairage + right.eclairage,
    proprete: left.proprete + right.proprete,
    espaces_verts: left.espaces_verts + right.espaces_verts,
    batiments: left.batiments + right.batiments,
  };
}

function confidence01(best: number, runnerUp: number, total: number): number {
  if (best <= 0) return 0;
  const margin = (best - runnerUp) / (best + 0.35);
  const mass = best / (total + 0.35);
  return Math.max(0, Math.min(1, 0.55 * margin + 0.45 * mass));
}

/**
 * Calcule le service et l'agent cible a la creation d'un ticket.
 */
export function routeIncomingTicket(input: RouteTicketInput): RoutingDecision {
  const text = classifyText([input.description, input.address]);
  const image = imageHintScores(input.imageProfile ?? null);
  const combined = sumScores(text.scores, image);
  const citizen = input.citizenCategory;

  const finalScores: ServiceScores = { ...combined };
  if (isOperationalService(citizen)) {
    finalScores[citizen] += CITIZEN_PRIOR;
  }

  const ranked = leadingService(finalScores);
  const combinedLead = leadingService(combined);
  const total = SERVICE_CATEGORIES.reduce((sum, key) => sum + finalScores[key], 0);

  let service: Category;
  let source: RoutingSource;

  if (isOperationalService(citizen)) {
    service = ranked.service;
    source = service === citizen ? "citizen" : "ai";
  } else if (combinedLead.score >= MIN_AI_SCORE) {
    service = combinedLead.service;
    source = "ai";
  } else {
    service = "autre";
    source = "ai";
  }

  const specialist =
    service === "autre" ? null : pickLeastLoadedSpecialist(service);

  const evidence = topEvidence(text.evidence, 4)
    .map((item) => `${item.term} (+${item.weight})`)
    .join(", ");
  const photoHints = describeImageHints(input.imageProfile ?? null);
  const reasonParts = [
    `Categorie citoyenne : ${categoryShortLabel(citizen)}.`,
    `Service retenu : ${categoryShortLabel(service)} (${source === "citizen" ? "choix usager" : "analyse locale"}).`,
  ];
  if (evidence) {
    reasonParts.push(`Indices texte : ${evidence}.`);
  }
  if (photoHints.length > 0) {
    reasonParts.push(`Photo : ${photoHints.join(", ")}.`);
  }
  if (specialist) {
    reasonParts.push(
      `Affecte a ${specialist.username} (specialite ${categoryShortLabel(service)}, ${specialist.openTickets} ticket(s) ouvert(s)).`
    );
  } else {
    reasonParts.push(
      "Aucun agent specialiste disponible : le ticket reste visible aux administrateurs et aux agents du service."
    );
  }

  const score =
    service === "autre"
      ? combinedLead.score > 0
        ? confidence01(combinedLead.score, combinedLead.runnerUp, total)
        : 0
      : confidence01(ranked.score, ranked.runnerUp, total);

  return {
    service,
    assignedAgentId: specialist?.id ?? null,
    assignedAgentUsername: specialist?.username ?? null,
    score: Math.round(score * 100) / 100,
    source,
    reason: reasonParts.join(" "),
  };
}

/**
 * Classifieur textuel local : somme ponderee des termes du lexique
 * presents dans la description, la precision "Autre" et l'adresse.
 *
 * Pourquoi ce choix (plutot qu'un LLM cloud ou un gros modele ONNX) :
 *  - zero dependance externe, zero fuite de donnees citoyennes ;
 *  - empreinte memoire/CPU negligeable (quelques Ko de lexique) ;
 *  - decision explicable (on peut lister les termes qui ont score).
 */
import { Category, SERVICE_CATEGORIES, ServiceCategory } from "../../domain/categories";
import { SERVICE_LEXICON } from "./lexicon";
import { foldFrench, tokenize } from "./normalize";

export type ServiceScores = Record<ServiceCategory, number>;

export interface TextEvidence {
  service: ServiceCategory;
  term: string;
  weight: number;
}

export interface TextClassification {
  scores: ServiceScores;
  evidence: TextEvidence[];
}

function emptyScores(): ServiceScores {
  return {
    voirie: 0,
    eclairage: 0,
    proprete: 0,
    espaces_verts: 0,
    batiments: 0,
  };
}

/**
 * Note un corpus libre contre le lexique municipal.
 * Les locutions (n-grammes) sont testees sur le texte foldé ;
 * les unigrammes le sont aussi via un Set de tokens (O(n)).
 */
export function classifyText(parts: string[]): TextClassification {
  const folded = foldFrench(parts.filter(Boolean).join(" "));
  const tokens = new Set(tokenize(folded));
  const scores = emptyScores();
  const evidence: TextEvidence[] = [];

  if (!folded) {
    return { scores, evidence };
  }

  for (const service of SERVICE_CATEGORIES) {
    for (const entry of SERVICE_LEXICON[service]) {
      const isPhrase = entry.term.includes(" ");
      const matched = isPhrase ? folded.includes(entry.term) : tokens.has(entry.term);
      if (!matched) continue;
      scores[service] += entry.weight;
      evidence.push({ service, term: entry.term, weight: entry.weight });
    }
  }

  return { scores, evidence };
}

export function topEvidence(evidence: TextEvidence[], limit = 4): TextEvidence[] {
  return [...evidence].sort((a, b) => b.weight - a.weight).slice(0, limit);
}

export function leadingService(scores: ServiceScores): {
  service: ServiceCategory;
  score: number;
  runnerUp: number;
} {
  let service: ServiceCategory = "voirie";
  let score = -1;
  let runnerUp = 0;

  for (const key of SERVICE_CATEGORIES) {
    const value = scores[key];
    if (value > score) {
      runnerUp = score;
      score = value;
      service = key;
    } else if (value > runnerUp) {
      runnerUp = value;
    }
  }

  return { service, score: Math.max(score, 0), runnerUp: Math.max(runnerUp, 0) };
}

export function isOperationalService(category: Category): category is ServiceCategory {
  return category !== "autre";
}

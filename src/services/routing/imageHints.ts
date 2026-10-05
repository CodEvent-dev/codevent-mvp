/**
 * Indices visuels frugaux extraits d'un echantillon de pixels.
 * Ce n'est PAS une reconnaissance d'objets : on mesure des dominantes
 * (vert vegetal, gris asphalte, scene sombre + points chauds) pour
 * n'apporter qu'un leger bonus au classifieur textuel.
 *
 * Echantillonnage grille : quelques centaines de pixels, pas l'image
 * entiere -> cout CPU/energie maitrise (Green IT).
 */
import { ServiceCategory } from "../../domain/categories";
import { ServiceScores } from "./textClassifier";

export interface RgbSample {
  r: number;
  g: number;
  b: number;
}

export interface ImageColorProfile {
  sampleCount: number;
  greenRatio: number;
  grayRatio: number;
  darkRatio: number;
  warmRatio: number;
  brownRatio: number;
  meanBrightness: number;
}

function emptyImageScores(): ServiceScores {
  return {
    voirie: 0,
    eclairage: 0,
    proprete: 0,
    espaces_verts: 0,
    batiments: 0,
  };
}

export function buildImageProfile(samples: RgbSample[]): ImageColorProfile | null {
  if (samples.length < 16) return null;

  let green = 0;
  let gray = 0;
  let dark = 0;
  let warm = 0;
  let brown = 0;
  let brightnessSum = 0;

  for (const { r, g, b } of samples) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const brightness = (r + g + b) / 3;
    brightnessSum += brightness;

    if (g > r + 18 && g > b + 12 && g > 70) green += 1;
    if (max - min < 22 && brightness > 40 && brightness < 200) gray += 1;
    if (brightness < 55) dark += 1;
    if (r > 140 && g > 90 && b < 90 && r >= g) warm += 1;
    if (r > 80 && g > 45 && b < 70 && r > b + 20 && Math.abs(r - g) < 55) brown += 1;
  }

  const n = samples.length;
  return {
    sampleCount: n,
    greenRatio: green / n,
    grayRatio: gray / n,
    darkRatio: dark / n,
    warmRatio: warm / n,
    brownRatio: brown / n,
    meanBrightness: brightnessSum / n,
  };
}

/**
 * Transforme le profil couleur en scores de service (poids faibles :
 * la photo ne doit jamais ecraser une description claire).
 */
export function imageHintScores(profile: ImageColorProfile | null): ServiceScores {
  const scores = emptyImageScores();
  if (!profile) return scores;

  if (profile.greenRatio > 0.18) {
    scores.espaces_verts += Math.min(1.6, profile.greenRatio * 3.2);
  }
  if (profile.grayRatio > 0.28) {
    scores.voirie += Math.min(1.2, profile.grayRatio * 2.2);
  }
  if (profile.darkRatio > 0.45 && profile.warmRatio > 0.04) {
    scores.eclairage += 1.4;
  } else if (profile.meanBrightness < 50) {
    scores.eclairage += 0.5;
  }
  if (profile.brownRatio > 0.16 && profile.greenRatio < 0.2) {
    scores.batiments += Math.min(1.1, profile.brownRatio * 2.4);
  }
  if (profile.grayRatio > 0.15 && profile.brownRatio > 0.1 && profile.greenRatio < 0.12) {
    scores.proprete += 0.6;
  }

  return scores;
}

export function describeImageHints(profile: ImageColorProfile | null): string[] {
  if (!profile) return [];
  const hints: string[] = [];
  if (profile.greenRatio > 0.18) hints.push("dominante vegetale");
  if (profile.grayRatio > 0.28) hints.push("dominante gris / enrobe");
  if (profile.darkRatio > 0.45) hints.push("scene sombre");
  if (profile.warmRatio > 0.04 && profile.darkRatio > 0.3) hints.push("points chauds (eclairage)");
  if (profile.brownRatio > 0.16) hints.push("tons facade / materiau");
  return hints;
}

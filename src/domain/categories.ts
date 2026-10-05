/**
 * Catalogue unique des categories / services municipaux.
 * Source de verite partagee par le formulaire citoyen, le routage IA,
 * le cloisonnement des agents et les exports.
 */
export const CATEGORIES = [
  "voirie",
  "eclairage",
  "proprete",
  "espaces_verts",
  "batiments",
  "autre",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Services operationnels (hors fourre-tout "autre"). */
export const SERVICE_CATEGORIES = [
  "voirie",
  "eclairage",
  "proprete",
  "espaces_verts",
  "batiments",
] as const;

export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  voirie: "Voirie / Nids-de-poule",
  eclairage: "Eclairage public",
  proprete: "Proprete / Depot sauvage",
  espaces_verts: "Espaces verts",
  batiments: "Batiments communaux",
  autre: "Autre",
};

export const CATEGORY_SHORT_LABELS: Record<Category, string> = {
  voirie: "Voirie",
  eclairage: "Eclairage",
  proprete: "Proprete",
  espaces_verts: "Espaces verts",
  batiments: "Batiments",
  autre: "Autre",
};

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

export function isServiceCategory(value: string): value is ServiceCategory {
  return (SERVICE_CATEGORIES as readonly string[]).includes(value);
}

export function categoryLabel(category: string): string {
  return isCategory(category) ? CATEGORY_LABELS[category] : category;
}

export function categoryShortLabel(category: string): string {
  return isCategory(category) ? CATEGORY_SHORT_LABELS[category] : category;
}

/**
 * Normalisation linguistique frugale (sans dictionnaire externe) :
 * minuscules, suppression des accents, tokenization.
 * Permet de matcher "éclairage", "Eclairage" et "eclairage" de la
 * meme facon, sans appel reseau ni modele de langue cloud.
 */
export function foldFrench(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(folded: string): string[] {
  if (!folded) return [];
  return folded.split(" ").filter((token) => token.length >= 2);
}

/**
 * Lexique metier municipal, maintenu localement.
 * Chaque terme est deja "fold" (sans accent) et ponderé : plus le
 * mot est discriminant ("lampadaire" >> "rue"), plus le poids est haut.
 *
 * Ce n'est pas un LLM : c'est un classifieur lexical explicable,
 * deterministe, et executable hors-ligne (Green IT + souverainete).
 */
import { ServiceCategory } from "../../domain/categories";
import { foldFrench } from "./normalize";

export interface LexiconEntry {
  /** Terme ou locution deja normalise(e). */
  term: string;
  /** Poids relatif (1 = faible, 4 = tres discriminant). */
  weight: number;
}

function entries(...pairs: Array<[string, number]>): LexiconEntry[] {
  return pairs.map(([term, weight]) => ({ term: foldFrench(term), weight }));
}

export const SERVICE_LEXICON: Record<ServiceCategory, LexiconEntry[]> = {
  voirie: entries(
    ["nid de poule", 4],
    ["nids de poule", 4],
    ["niddepoule", 4],
    ["trottoir", 3],
    ["chaussee", 3],
    ["enrobe", 3],
    ["bitume", 3],
    ["caniveau", 3],
    ["accotement", 3],
    ["bordure", 2.5],
    ["dos d ane", 3],
    ["passage pieton", 3],
    ["marquage au sol", 3],
    ["plaque d egout", 3],
    ["bouche d egout", 3],
    ["fissure", 2],
    ["fissuree", 2],
    ["goudron", 2.5],
    ["pave", 2],
    ["paves", 2],
    ["route", 1.5],
    ["voirie", 3.5],
    ["nids", 1.5],
    ["poule", 1.2],
    ["glissant", 1.5],
    ["affaissement", 2.5],
    ["nid", 1.2],
    ["gravier", 1.5],
    ["trottoirs", 3]
  ),
  eclairage: entries(
    ["lampadaire", 4],
    ["lampadaires", 4],
    ["eclairage public", 4],
    ["eclairage", 3.5],
    ["candelabre", 4],
    ["ampoule", 2.5],
    ["luminaire", 3.5],
    ["lumiere", 2],
    ["eteint", 2],
    ["eteints", 2],
    ["clignote", 2.5],
    ["clignotant", 2],
    ["obscurite", 2],
    ["sombre", 1.5],
    ["panne d eclairage", 4],
    ["eclairage en panne", 4],
    ["plus de lumiere", 3]
  ),
  proprete: entries(
    ["depot sauvage", 4],
    ["encombrant", 3.5],
    ["encombrants", 3.5],
    ["poubelle", 3],
    ["poubelles", 3],
    ["ordure", 3],
    ["ordures", 3],
    ["dechet", 3],
    ["dechets", 3],
    ["decharge", 2.5],
    ["gravats", 3],
    ["matelas", 2.5],
    ["frigo", 2],
    ["canette", 2],
    ["carton", 1.5],
    ["tag", 2.5],
    ["graffiti", 2.5],
    ["salete", 2],
    ["souille", 2],
    ["crotte", 2],
    ["crottes", 2],
    ["excrement", 2.5],
    ["proprete", 3],
    ["detritus", 3],
    ["sac poubelle", 3]
  ),
  espaces_verts: entries(
    ["espaces verts", 4],
    ["espace vert", 4],
    ["arbre tombe", 4],
    ["arbre", 3],
    ["arbres", 3],
    ["branche cassee", 3.5],
    ["branche", 2.5],
    ["branches", 2.5],
    ["haie", 3],
    ["haies", 3],
    ["pelouse", 3],
    ["gazon", 3],
    ["herbe", 2],
    ["tonte", 2.5],
    ["elagage", 3.5],
    ["elaguer", 3],
    ["massif", 2],
    ["fleur", 1.5],
    ["fleurs", 1.5],
    ["parc", 2],
    ["jardin", 2],
    ["racine", 2],
    ["souche", 2.5],
    ["feuilles", 1.5],
    ["tombe", 1.2]
  ),
  batiments: entries(
    ["batiment communal", 4],
    ["batiments communaux", 4],
    ["ecole", 3],
    ["gymnase", 3.5],
    ["salle des fetes", 3.5],
    ["bibliotheque", 3],
    ["cantine", 2.5],
    ["toiture", 3.5],
    ["fuite d eau", 3],
    ["fuite", 2],
    ["fenetre", 2],
    ["fenetres", 2],
    ["facade", 2.5],
    ["porte", 1.2],
    ["plafond", 2.5],
    ["chauffage", 2],
    ["sanitaire", 2.5],
    ["sanitaires", 2.5],
    ["vestiaire", 2.5],
    ["mur", 1.2],
    ["batiment", 3],
    ["interieur", 1.2]
  ),
};

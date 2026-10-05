/**
 * Adresse a partir d'un point GPS.
 *
 * 1. Numero officiel (Base Adresse Nationale) seulement s'il est a moins
 *    de 200 m ET dans la commune du point. Au-dela, la BAN renvoie souvent
 *    un lieu-dit ou une rue du secteur, pas l'endroit reel.
 * 2. Sinon, nom de la voie au point exact (OpenStreetMap / Nominatim,
 *    heberge en Europe) + commune officielle (geo.api.gouv.fr).
 */
import { AppError } from "../utils/AppError";

const BAN_REVERSE = "https://api-adresse.data.gouv.fr/reverse/";
const COMMUNES_URL = "https://geo.api.gouv.fr/communes";
const NOMINATIM_REVERSE = "https://nominatim.openstreetmap.org/reverse";
const TIMEOUT_MS = 5000;
const MAX_HOUSENUMBER_DISTANCE_M = 200;

interface BanFeature {
  properties?: {
    label?: string;
    city?: string;
    type?: string;
    distance?: number;
  };
}

interface BanResponse {
  features?: BanFeature[];
}

interface CommuneHit {
  nom?: string;
  codesPostaux?: string[];
}

interface NominatimAddress {
  house_number?: string;
  road?: string;
  pedestrian?: string;
  footway?: string;
  path?: string;
}

interface NominatimResponse {
  address?: NominatimAddress;
}

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "MairieConnect/1.0 (signalement communal)",
};

function assertCoordinates(latitude: number, longitude: number): void {
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new AppError("Coordonnees GPS invalides.");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new AppError("Coordonnees GPS invalides.");
  }
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function usableLabel(label: string | undefined): string | null {
  const value = label?.replace(/\s+/g, " ").trim() ?? "";
  if (value.length < 3 || value.length > 255) return null;
  return value;
}

async function fetchJson<T>(url: URL): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function communeAt(latitude: number, longitude: number): Promise<CommuneHit | null> {
  const url = new URL(COMMUNES_URL);
  url.searchParams.set("lat", latitude.toFixed(6));
  url.searchParams.set("lon", longitude.toFixed(6));
  url.searchParams.set("fields", "nom,codesPostaux");
  url.searchParams.set("format", "json");
  const payload = await fetchJson<CommuneHit[]>(url);
  const first = payload?.[0];
  if (!first?.nom) return null;
  return first;
}

async function closeOfficialNumber(
  latitude: number,
  longitude: number,
  commune: CommuneHit | null
): Promise<string | null> {
  const url = new URL(BAN_REVERSE);
  url.searchParams.set("lat", latitude.toFixed(6));
  url.searchParams.set("lon", longitude.toFixed(6));
  url.searchParams.set("limit", "5");
  const payload = await fetchJson<BanResponse>(url);
  const features = payload?.features ?? [];

  const match = features
    .filter((feature) => feature.properties?.type === "housenumber")
    .filter((feature) => {
      const distance = feature.properties?.distance;
      return typeof distance === "number" && distance <= MAX_HOUSENUMBER_DISTANCE_M;
    })
    .filter((feature) => {
      if (!commune?.nom || !feature.properties?.city) return true;
      return normalizeName(feature.properties.city) === normalizeName(commune.nom);
    })
    .sort(
      (a, b) =>
        (a.properties?.distance ?? Number.POSITIVE_INFINITY) -
        (b.properties?.distance ?? Number.POSITIVE_INFINITY)
    )[0];

  return usableLabel(match?.properties?.label);
}

async function roadAtPoint(latitude: number, longitude: number): Promise<NominatimAddress | null> {
  const url = new URL(NOMINATIM_REVERSE);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", latitude.toFixed(6));
  url.searchParams.set("lon", longitude.toFixed(6));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  const payload = await fetchJson<NominatimResponse>(url);
  return payload?.address ?? null;
}

function formatRoadAddress(road: NominatimAddress, commune: CommuneHit | null): string | null {
  const street =
    road.road || road.pedestrian || road.footway || road.path || "";
  if (!street) return null;

  const number = road.house_number?.trim();
  const way = number ? `${number} ${street}` : street;
  if (!commune?.nom) return usableLabel(way);

  const postcode = commune.codesPostaux?.[0] ?? "";
  const locality = [postcode, commune.nom].filter(Boolean).join(" ");
  return usableLabel(`${way}, ${locality}`);
}

interface BanSearchFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string; score?: number };
}

export interface ForwardGeocodeResult {
  latitude: number;
  longitude: number;
  label: string;
}

/** Coordonnees exploitables : pas nulles, pas le point 0,0 (ocean). */
export function isUsableCoordinate(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): boolean {
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) < 0.000001 && Math.abs(longitude) < 0.000001) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  return true;
}

/**
 * Adresse saisie a la main -> coordonnees du meilleur resultat
 * de la Base Adresse Nationale. Utilise quand le citoyen n'a pas
 * fourni de GPS precis.
 */
export async function forwardGeocode(address: string): Promise<ForwardGeocodeResult | null> {
  const query = address.trim();
  if (query.length < 3) return null;

  const url = new URL("https://api-adresse.data.gouv.fr/search/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  const payload = await fetchJson<{ features?: BanSearchFeature[] }>(url);
  const feature = payload?.features?.[0];
  const coordinates = feature?.geometry?.coordinates;
  const label = usableLabel(feature?.properties?.label);
  if (!coordinates || coordinates.length < 2 || !label) return null;

  const longitude = coordinates[0];
  const latitude = coordinates[1];
  if (!isUsableCoordinate(latitude, longitude)) return null;
  return { latitude, longitude, label };
}

export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  assertCoordinates(latitude, longitude);

  const commune = await communeAt(latitude, longitude);
  const officialNumber = await closeOfficialNumber(latitude, longitude, commune);
  if (officialNumber) return officialNumber;

  const road = await roadAtPoint(latitude, longitude);
  if (road) {
    const formatted = formatRoadAddress(road, commune);
    if (formatted) return formatted;
  }

  if (commune?.nom) {
    const postcode = commune.codesPostaux?.[0] ?? "";
    const label = usableLabel([commune.nom, postcode].filter(Boolean).join(" "));
    if (label) return label;
  }

  throw new AppError(
    "Aucune adresse proche n'a ete trouvee. Merci de la saisir a la main.",
    404
  );
}

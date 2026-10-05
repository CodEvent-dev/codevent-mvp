/**
 * Traitement securise des photos jointes aux signalements.
 *
 * Objectifs :
 *  1. SECURITE : ne jamais faire confiance a l'extension/mimetype fournis
 *     par le client. On decode reellement l'image (Jimp) puis on la
 *     RE-ENCODE integralement depuis zero. Un fichier malveillant
 *     (script cache dans un faux .jpg, polyglotte, EXIF piege...) ne
 *     peut pas survivre a ce pipeline car seuls les pixels decodes
 *     sont conserves ; aucune metadonnee ni octet d'origine n'est copie.
 *  2. GREEN IT : redimensionnement + compression -> fichiers legers,
 *     donc bande passante et stockage reduits.
 *
 * Decodage limite a JPEG et PNG (paquets Jimp minimaux, sans GIF/WebP/TIFF
 * ni plugins inutiles). Le navigateur convertit deja la photo en JPEG
 * leger avant l'envoi. Pas de binaire natif : deploiement mutualise simple.
 */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createJimp } from "@jimp/core";
import jpeg from "@jimp/js-jpeg";
import png from "@jimp/js-png";
import { methods as resizeMethods } from "@jimp/plugin-resize";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { buildImageProfile, ImageColorProfile, RgbSample } from "./routing/imageHints";

const Photo = createJimp({
  formats: [jpeg, png],
  plugins: [resizeMethods],
});

const MAX_WIDTH = 1280;
const JPEG_QUALITY = 70;
const MAX_PIXELS = 16_000_000; // Anti "image bomb" : 16 megapixels max
const MAX_DECODE_BYTES = 12 * 1024 * 1024;

if (!fs.existsSync(env.UPLOAD_DIR_ABS)) {
  fs.mkdirSync(env.UPLOAD_DIR_ABS, { recursive: true });
}

/**
 * Verifie la "signature magique" des premiers octets du fichier pour
 * confirmer qu'il s'agit reellement d'une image (JPEG/PNG/WEBP/GIF),
 * independamment du mimetype declare par le navigateur (facilement
 * falsifiable).
 */
function detectRealImageFormat(buffer: Buffer): "jpeg" | "png" | null {
  if (buffer.length < 8) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "png";
  }
  return null;
}

/**
 * Decode un buffer en image Jimp, ou leve une erreur explicite en
 * francais si le fichier est corrompu/illisible. Isole dans sa propre
 * fonction pour laisser TypeScript inferer naturellement le type de
 * retour (evite les soucis d'annotation manuelle avec les generiques
 * complexes de Jimp v1).
 */
async function readImageOrThrow(buffer: Buffer) {
  try {
    return await Photo.read(buffer);
  } catch {
    throw new AppError(
      "Impossible de lire l'image envoyee. Le fichier est peut-etre corrompu."
    );
  }
}

/**
 * Traite un buffer image uploade : valide sa nature reelle, le
 * redimensionne, le recompresse en JPEG propre, et l'enregistre sous
 * un nom de fichier genere aleatoirement (jamais le nom d'origine,
 * qui pourrait contenir un chemin ou un payload).
 *
 * @returns le chemin relatif et un profil couleur (routage local)
 */
export interface StoredPhoto {
  path: string;
  colorProfile: ImageColorProfile | null;
}

function sampleImageGrid(image: { width: number; height: number; getPixelColor: (x: number, y: number) => number }, size = 20): RgbSample[] {
  const samples: RgbSample[] = [];
  if (image.width < 2 || image.height < 2) return samples;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const x = Math.min(image.width - 1, Math.floor(((col + 0.5) / size) * image.width));
      const y = Math.min(image.height - 1, Math.floor(((row + 0.5) / size) * image.height));
      const rgba = image.getPixelColor(x, y) >>> 0;
      samples.push({
        r: (rgba >>> 24) & 255,
        g: (rgba >>> 16) & 255,
        b: (rgba >>> 8) & 255,
      });
    }
  }
  return samples;
}

export async function processAndStorePhoto(
  buffer: Buffer
): Promise<StoredPhoto> {
  if (buffer.length > MAX_DECODE_BYTES) {
    throw new AppError("La photo envoyee est trop volumineuse.");
  }

  const detectedFormat = detectRealImageFormat(buffer);
  if (!detectedFormat) {
    throw new AppError(
      "Le fichier envoye n'est pas reconnu comme une image JPEG ou PNG."
    );
  }

  const image = await readImageOrThrow(buffer);

  const pixels = image.width * image.height;
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels > MAX_PIXELS) {
    throw new AppError("Cette image a une resolution trop elevee pour etre acceptee.");
  }

  if (image.width > MAX_WIDTH || image.height > MAX_WIDTH) {
    if (image.width >= image.height) {
      image.resize({ w: MAX_WIDTH });
    } else {
      image.resize({ h: MAX_WIDTH });
    }
  }

  const jpegBuffer = await image.getBuffer("image/jpeg", { quality: JPEG_QUALITY });

  const fileName = `${crypto.randomUUID()}.jpg`;
  const destinationPath = path.resolve(env.UPLOAD_DIR_ABS, fileName);
  const rootWithSep = env.UPLOAD_DIR_ABS.endsWith(path.sep)
    ? env.UPLOAD_DIR_ABS
    : env.UPLOAD_DIR_ABS + path.sep;

  if (!destinationPath.startsWith(rootWithSep) && destinationPath !== env.UPLOAD_DIR_ABS) {
    throw new AppError("Impossible d'enregistrer la photo.", 500);
  }

  await fs.promises.mkdir(env.UPLOAD_DIR_ABS, { recursive: true });
  await fs.promises.writeFile(destinationPath, jpegBuffer, { flag: "wx" });

  return {
    path: `/uploads/${fileName}`,
    colorProfile: buildImageProfile(sampleImageGrid(image)),
  };
}

/**
 * Supprime physiquement un fichier photo du disque (utilise lors de
 * l'anonymisation RGPD). Ne leve jamais d'erreur bloquante si le
 * fichier est deja absent.
 */
export function deletePhotoFile(relativePath: string | null): void {
  if (!relativePath) return;
  const fileName = path.basename(relativePath);
  if (!/^[0-9a-f-]{36}\.jpg$/i.test(fileName)) return;
  const fullPath = path.resolve(env.UPLOAD_DIR_ABS, fileName);
  const rootWithSep = env.UPLOAD_DIR_ABS.endsWith(path.sep)
    ? env.UPLOAD_DIR_ABS
    : env.UPLOAD_DIR_ABS + path.sep;
  if (!fullPath.startsWith(rootWithSep)) return;
  fs.rm(fullPath, { force: true }, () => {
    /* suppression best-effort */
  });
}

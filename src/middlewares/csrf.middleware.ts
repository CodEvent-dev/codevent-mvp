/**
 * Protection CSRF (Cross-Site Request Forgery) par jeton synchronise
 * en session ("synchronizer token pattern"), implementee sans
 * dependance externe pour rester legere et maintenable.
 *
 * Principe :
 *  1. Un jeton aleatoire est genere et stocke en session a la premiere
 *     visite, puis injecte dans chaque formulaire (champ cache).
 *  2. Toute requete de mutation (POST/PUT/PATCH/DELETE) doit renvoyer
 *     ce meme jeton (champ de formulaire ou en-tete X-CSRF-Token) ;
 *     sinon la requete est rejetee.
 *  3. La comparaison est a temps constant (timingSafeEqual) pour ne
 *     pas fuiter le jeton par analyse de latence.
 */
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/AppError";
import { timingSafeEqualString } from "../utils/cryptoSafe";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function readSubmittedToken(req: Request): string | null {
  const fromBody = req.body && req.body._csrf;
  const fromHeader = req.headers["x-csrf-token"];

  if (typeof fromBody === "string" && fromBody.length > 0) {
    return fromBody;
  }
  if (typeof fromHeader === "string" && fromHeader.length > 0) {
    return fromHeader;
  }
  return null;
}

/**
 * S'assure qu'un jeton CSRF existe en session et le rend disponible
 * a toutes les vues via `res.locals.csrfToken`.
 */
export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

/**
 * Verifie le jeton CSRF sur les requetes de mutation. A placer apres
 * `ensureCsrfToken` et apres le parsing du corps de la requete.
 */
export function verifyCsrfToken(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const submitted = readSubmittedToken(req);
  const expected = req.session.csrfToken;

  if (!expected || !submitted || !timingSafeEqualString(submitted, expected)) {
    next(
      new AppError(
        "Jeton de securite invalide ou expire. Merci de recharger la page et de reessayer.",
        403
      )
    );
    return;
  }

  next();
}

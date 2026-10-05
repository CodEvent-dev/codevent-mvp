/**
 * Enveloppe les controleurs (synchrones OU asynchrones) pour transmettre
 * proprement toute erreur a Express : capture les exceptions levees de
 * facon synchrone (try/catch) ET les rejets de promesses (async/await),
 * evitant ainsi les rejets non geres qui pourraient planter le processus.
 */
import { Request, Response, NextFunction, RequestHandler } from "express";

type ControllerHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => unknown;

export function asyncHandler(fn: ControllerHandler): RequestHandler {
  return (req, res, next) => {
    try {
      const result = fn(req, res, next);
      if (result && typeof (result as Promise<unknown>).catch === "function") {
        (result as Promise<unknown>).catch(next);
      }
    } catch (error) {
      next(error);
    }
  };
}

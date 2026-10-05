/**
 * Protection des routes de l'espace agent : verifie la presence d'une
 * session valide avant d'autoriser l'acces. Separe strictement
 * l'espace public (aucune authentification) de l'espace prive.
 * Recharge le role et les specialites depuis la base a chaque requete
 * (un changement d'affectation prend effet sans attendre la fin de session).
 */
import { Request, Response, NextFunction } from "express";
import { CATEGORIES } from "../domain/categories";
import { getAgentById, listAgentSpecialties } from "../models/agent.model";
import { AgentAccess } from "../services/access.service";
import { AppError } from "../utils/AppError";

function attachAccess(req: Request, res: Response): AgentAccess | null {
  const agentId = req.session?.agentId;
  if (!agentId) return null;

  const agent = getAgentById(agentId);
  if (!agent || agent.active !== 1) return null;

  const specialties =
    agent.role === "admin" ? [...CATEGORIES] : listAgentSpecialties(agent.id);

  const access: AgentAccess = {
    id: agent.id,
    username: agent.username,
    fullName: agent.full_name,
    role: agent.role,
    specialties,
  };

  req.agentAccess = access;
  req.session.agentRole = agent.role;
  req.session.agentUsername = agent.username;
  res.locals.agentUsername = agent.username;
  res.locals.currentAgentRole = agent.role;
  res.locals.agentSpecialties = specialties;
  res.locals.agentFullName = agent.full_name;
  return access;
}

export function requireAgentAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.agentId && attachAccess(req, res)) {
    next();
    return;
  }

  if (req.session?.agentId) {
    req.session.destroy(() => {
      res.redirect("/admin/login");
    });
    return;
  }

  if (req.headers.accept?.includes("application/json")) {
    res.status(401).json({ error: "Session expiree, merci de vous reconnecter." });
    return;
  }

  res.redirect("/admin/login");
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.agentAccess?.role === "admin") {
    next();
    return;
  }
  throw new AppError("Acces reserve aux administrateurs.", 403);
}

export function redirectIfAlreadyAuthenticated(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.session && req.session.agentId) {
    res.redirect("/admin/dashboard");
    return;
  }
  next();
}

/**
 * Controleurs d'authentification de l'espace agent.
 */
import crypto from "crypto";
import { Request, Response } from "express";
import { env } from "../config/env";
import { authenticateAgent } from "../services/auth.service";
import { loginSchema } from "../utils/validators";
import { AppError } from "../utils/AppError";

export function showLoginPage(req: Request, res: Response): void {
  res.render("admin/login", {
    title: `Connexion agent - ${env.COMMUNE_NAME}`,
    communeName: env.COMMUNE_NAME,
    error: null,
  });
}

export async function handleLogin(req: Request, res: Response): Promise<void> {
  const parseResult = loginSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).render("admin/login", {
      title: `Connexion agent - ${env.COMMUNE_NAME}`,
      communeName: env.COMMUNE_NAME,
      error: "Merci de renseigner votre identifiant et votre mot de passe.",
    });
    return;
  }

  try {
    const agent = await authenticateAgent(
      parseResult.data.username,
      parseResult.data.password,
      req.ip ?? "0.0.0.0"
    );

    req.session.regenerate((err) => {
      if (err) {
        res.status(500).render("admin/login", {
          title: `Connexion agent - ${env.COMMUNE_NAME}`,
          communeName: env.COMMUNE_NAME,
          error: "Erreur technique lors de la connexion. Merci de reessayer.",
        });
        return;
      }

      req.session.agentId = agent.id;
      req.session.agentUsername = agent.username;
      req.session.agentRole = agent.role;
      req.session.csrfToken = crypto.randomBytes(32).toString("hex");

      res.redirect("/admin/dashboard");
    });
  } catch (error) {
    const status = error instanceof AppError ? error.statusCode : 401;
    const message =
      error instanceof AppError
        ? error.message
        : "Identifiant ou mot de passe incorrect.";

    res.status(status).render("admin/login", {
      title: `Connexion agent - ${env.COMMUNE_NAME}`,
      communeName: env.COMMUNE_NAME,
      error: message,
    });
  }
}

export function handleLogout(req: Request, res: Response): void {
  req.session.destroy(() => {
    res.clearCookie(env.SESSION_COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: env.IS_PRODUCTION,
      sameSite: "strict",
    });
    res.redirect("/admin/login");
  });
}

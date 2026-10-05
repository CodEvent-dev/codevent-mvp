/**
 * Logique d'authentification des agents municipaux.
 * Mots de passe haches avec bcrypt (bcryptjs, implementation pure JS,
 * sans binaire natif, pour une portabilite maximale en hebergement
 * mutualise). Jamais de mot de passe en clair stocke ou logge.
 */
import bcrypt from "bcryptjs";
import { AppError } from "../utils/AppError";
import {
  getAgentByUsername,
  createAgent,
  countAgents,
  touchLastLogin,
  Agent,
} from "../models/agent.model";
import { env } from "../config/env";
import {
  isLoginLocked,
  registerLoginFailure,
  registerLoginSuccess,
} from "./loginLockout.service";

const BCRYPT_SALT_ROUNDS = 13;

const DUMMY_HASH = bcrypt.hashSync("not-a-real-password-timing-guard", BCRYPT_SALT_ROUNDS);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function authenticateAgent(
  username: string,
  password: string,
  clientIp: string
): Promise<Agent> {
  if (isLoginLocked(clientIp, username)) {
    throw new AppError(
      "Trop de tentatives. Merci de reessayer dans quelques minutes.",
      429
    );
  }

  const agent = getAgentByUsername(username);

  if (!agent) {
    await bcrypt.compare(password, DUMMY_HASH);
    registerLoginFailure(clientIp, username);
    throw new AppError("Identifiant ou mot de passe incorrect.", 401);
  }

  const isValid = await verifyPassword(password, agent.password_hash);
  if (!isValid) {
    registerLoginFailure(clientIp, username);
    throw new AppError("Identifiant ou mot de passe incorrect.", 401);
  }

  registerLoginSuccess(clientIp, username);
  touchLastLogin(agent.id);
  return agent;
}

export async function ensureDefaultAdminExists(): Promise<void> {
  if (countAgents() > 0) return;

  const passwordHash = await hashPassword(env.ADMIN_DEFAULT_PASSWORD);
  createAgent({
    username: env.ADMIN_DEFAULT_USERNAME,
    passwordHash,
    fullName: "Administrateur",
    role: "admin",
  });

  console.warn(
    `[MairieConnect] Compte administrateur cree : "${env.ADMIN_DEFAULT_USERNAME}". ` +
      "Merci de changer ce mot de passe immediatement depuis un environnement securise."
  );
}

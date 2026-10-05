/**
 * Extension du typage de express-session pour y stocker l'identite
 * de l'agent connecte et le jeton CSRF courant.
 */
import "express-session";

declare module "express-session" {
  interface SessionData {
    agentId?: string;
    agentUsername?: string;
    agentRole?: "agent" | "admin";
    csrfToken?: string;
  }
}

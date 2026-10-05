import { AgentAccess } from "../services/access.service";

declare global {
  namespace Express {
    interface Request {
      agentAccess?: AgentAccess;
    }
  }
}

export {};

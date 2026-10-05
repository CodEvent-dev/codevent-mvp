/**
 * Routes de l'espace agent (prive). Toutes les routes de ce fichier
 * sont protegees par `requireAgentAuth` (voir montage dans app.ts).
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { verifyCsrfToken } from "../middlewares/csrf.middleware";
import { requireUuidParam } from "../middlewares/validateParams.middleware";
import {
  showDashboard,
  showSignalementDetail,
  updateSignalementStatus,
  addInternalNote,
  reassignTicket,
  exportCsv,
  exportPdf,
  triggerRetentionPurge,
} from "../controllers/admin.controller";
import { showAgentsPage, handleCreateAgent, handleUpdateAgent } from "../controllers/agents.controller";
import { requireAdmin } from "../middlewares/auth.middleware";

export const adminRouter = Router();

adminRouter.get("/dashboard", asyncHandler(showDashboard));

adminRouter.get("/agents", requireAdmin, asyncHandler(showAgentsPage));
adminRouter.post("/agents", requireAdmin, verifyCsrfToken, asyncHandler(handleCreateAgent));
adminRouter.post(
  "/agents/:id",
  requireAdmin,
  requireUuidParam("id"),
  verifyCsrfToken,
  asyncHandler(handleUpdateAgent)
);

adminRouter.get("/signalements/:id", requireUuidParam("id"), asyncHandler(showSignalementDetail));
adminRouter.post(
  "/signalements/:id/statut",
  requireUuidParam("id"),
  verifyCsrfToken,
  asyncHandler(updateSignalementStatus)
);
adminRouter.post(
  "/signalements/:id/notes",
  requireUuidParam("id"),
  verifyCsrfToken,
  asyncHandler(addInternalNote)
);
adminRouter.post(
  "/signalements/:id/affectation",
  requireUuidParam("id"),
  verifyCsrfToken,
  asyncHandler(reassignTicket)
);

adminRouter.get("/export/csv", asyncHandler(exportCsv));
adminRouter.get("/export/pdf", asyncHandler(exportPdf));

adminRouter.post("/purge", verifyCsrfToken, asyncHandler(triggerRetentionPurge));

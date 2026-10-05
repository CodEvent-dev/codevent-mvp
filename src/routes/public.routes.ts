/**
 * Routes de l'espace citoyen (public, sans authentification).
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { photoUpload } from "../middlewares/upload.middleware";
import { createSignalementRateLimiter, trackingRateLimiter, geocodeRateLimiter } from "../middlewares/rateLimiters";
import { verifyCsrfToken } from "../middlewares/csrf.middleware";
import {
  showHomePage,
  submitSignalement,
  showConfirmationPage,
  showTrackingForm,
  handleTrackingLookup,
  apiTrackingLookup,
  showLegalNotice,
  reverseGeocodeAddress,
} from "../controllers/public.controller";

export const publicRouter = Router();

publicRouter.get("/", showHomePage);

publicRouter.post(
  "/api/signalements",
  createSignalementRateLimiter,
  photoUpload,
  verifyCsrfToken,
  asyncHandler(submitSignalement)
);

publicRouter.get("/confirmation", showConfirmationPage);

publicRouter.get("/suivi", showTrackingForm);
publicRouter.post("/suivi", trackingRateLimiter, verifyCsrfToken, handleTrackingLookup);

publicRouter.get("/api/suivi/:code", trackingRateLimiter, asyncHandler(apiTrackingLookup));

publicRouter.get("/api/geocode", geocodeRateLimiter, asyncHandler(reverseGeocodeAddress));

publicRouter.get("/mentions-legales", showLegalNotice);

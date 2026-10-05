/**
 * Routes d'authentification de l'espace agent.
 */
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { loginRateLimiter } from "../middlewares/rateLimiters";
import { verifyCsrfToken } from "../middlewares/csrf.middleware";
import { redirectIfAlreadyAuthenticated } from "../middlewares/auth.middleware";
import { showLoginPage, handleLogin, handleLogout } from "../controllers/auth.controller";

export const authRouter = Router();

authRouter.get("/login", redirectIfAlreadyAuthenticated, showLoginPage);
authRouter.post(
  "/login",
  loginRateLimiter,
  redirectIfAlreadyAuthenticated,
  verifyCsrfToken,
  asyncHandler(handleLogin)
);
authRouter.post("/logout", verifyCsrfToken, handleLogout);

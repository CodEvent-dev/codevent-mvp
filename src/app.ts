/**
 * Configuration centrale de l'application Express.
 * Securite HTTP (Helmet + CSP stricte + HSTS en production), sessions
 * durcies, fichiers statiques separes des uploads, routage public / admin.
 */
import path from "path";
import express, { Express } from "express";
import helmet from "helmet";
import compression from "compression";
import session from "express-session";
import { env } from "./config/env";
import { SqliteSessionStore } from "./services/sqliteSessionStore";
import { ensureCsrfToken } from "./middlewares/csrf.middleware";
import { requireAgentAuth } from "./middlewares/auth.middleware";
import { globalRateLimiter } from "./middlewares/rateLimiters";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware";
import { restrictHttpMethods, noStoreHtml, rejectArrayParams } from "./middlewares/httpGuard.middleware";
import { serveSecurePhoto } from "./middlewares/photoServe.middleware";
import { separatePublicAndAdminAccess } from "./middlewares/accessSplit.middleware";
import { publicRouter } from "./routes/public.routes";
import { authRouter } from "./routes/auth.routes";
import { adminRouter } from "./routes/admin.routes";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("query parser", "simple");
  app.set("trust proxy", env.TRUST_PROXY_HOPS);
  app.set("view engine", "ejs");
  app.set("views", path.join(env.ROOT_DIR, "views"));

  app.use(restrictHttpMethods);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "blob:"],
          fontSrc: ["'self'"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'none'"],
          frameAncestors: ["'none'"],
        formAction: ["'self'"],
          workerSrc: ["'none'"],
          manifestSrc: ["'self'"],
          mediaSrc: ["'none'"],
          childSrc: ["'none'"],
          ...(env.IS_PRODUCTION ? { upgradeInsecureRequests: [] as string[] } : {}),
        },
      },
      frameguard: { action: "deny" },
      referrerPolicy: { policy: "no-referrer" },
      crossOriginOpenerPolicy: { policy: "same-origin" },
      crossOriginResourcePolicy: { policy: "same-origin" },
      crossOriginEmbedderPolicy: false,
      hsts: env.IS_PRODUCTION
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    })
  );

  app.use((_req, res, next) => {
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), payment=(), usb=(), geolocation=(self), browsing-topics=()"
    );
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
    next();
  });

  app.use(compression());
  app.use(noStoreHtml);

  app.use(
    express.static(path.join(env.ROOT_DIR, "public"), {
      index: false,
      dotfiles: "deny",
      maxAge: env.IS_PRODUCTION ? "7d" : 0,
      etag: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".css") || filePath.endsWith(".js") || filePath.endsWith(".svg")) {
          res.setHeader("X-Content-Type-Options", "nosniff");
          res.setHeader("Cache-Control", env.IS_PRODUCTION ? "public, max-age=604800" : "no-cache");
        }
      },
    })
  );

  app.get("/uploads/:filename", serveSecurePhoto);

  app.use(globalRateLimiter);

  app.use(express.urlencoded({ extended: false, limit: "32kb" }));
  app.use(express.json({ limit: "32kb" }));
  app.use(rejectArrayParams);

  app.use(
    session({
      store: new SqliteSessionStore(),
      name: env.SESSION_COOKIE_NAME,
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      proxy: env.IS_PRODUCTION,
      cookie: {
        httpOnly: true,
        secure: env.IS_PRODUCTION,
        sameSite: "strict",
        path: "/",
        maxAge: env.SESSION_MAX_AGE_HOURS * 60 * 60 * 1000,
      },
    })
  );

  app.use(ensureCsrfToken);

  app.use((req, res, next) => {
    res.locals.communeName = env.COMMUNE_NAME;
    res.locals.currentAgent = req.session.agentUsername ?? null;
    res.locals.currentAgentRole = req.session.agentRole ?? null;
    res.locals.currentPath = req.path;
    next();
  });

  app.use(separatePublicAndAdminAccess);

  app.use("/", publicRouter);

  app.get("/admin", (req, res) => {
    res.redirect(req.session.agentId ? "/admin/dashboard" : "/admin/login");
  });

  app.use("/admin", authRouter);
  app.use("/admin", requireAgentAuth, adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

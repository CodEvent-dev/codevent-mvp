/**
 * Separe l'acces public (citoyens) de l'acces interne (agents).
 *
 * - Sur PUBLIC_HOST (ou tout hote qui n'est pas ADMIN_HOST) : /admin
 *   repond comme une page introuvable. Le formulaire de connexion
 *   n'est pas annonce sur Internet.
 * - Sur ADMIN_HOST : la racine ouvre l'espace agent. Les pages
 *   citoyennes ne sont pas servies ici.
 * - Si ADMIN_ALLOWED_IPS est renseigne, seules ces adresses (ou ces
 *   reseaux CIDR IPv4) peuvent ouvrir l'hote agent.
 *
 * Les deux variables vides = mode local, les deux espaces restent
 * sur http://localhost:3000.
 */
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

const STATIC_PREFIXES = ["/css/", "/js/", "/uploads/", "/favicon.svg"];

function requestHost(req: Request): string {
  const raw = req.headers.host ?? "";
  return raw.split(":")[0].trim().toLowerCase();
}

function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

function isStaticAsset(path: string): boolean {
  return STATIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix));
}

function clientIpv4(req: Request): string {
  const raw = (req.ip ?? "").replace(/^::ffff:/i, "");
  if (raw === "::1") return "127.0.0.1";
  return raw;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value * 256 + octet) >>> 0;
  }
  return value;
}

function ipMatchesRule(ip: string, rule: string): boolean {
  if (rule === ip) return true;
  const slash = rule.indexOf("/");
  if (slash === -1) return false;

  const base = rule.slice(0, slash);
  const bits = Number(rule.slice(slash + 1));
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(base);
  if (ipInt === null || baseInt === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
    return false;
  }
  if (bits === 0) return true;
  const mask = (~0 << (32 - bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function adminIpAllowed(req: Request): boolean {
  if (env.ADMIN_ALLOWED_IPS.length === 0) return true;
  const ip = clientIpv4(req);
  return env.ADMIN_ALLOWED_IPS.some((rule) => ipMatchesRule(ip, rule));
}

export function separatePublicAndAdminAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!env.ADMIN_HOST) {
    next();
    return;
  }

  const host = requestHost(req);
  const onAdminHost = host === env.ADMIN_HOST;

  if (onAdminHost) {
    if (!adminIpAllowed(req)) {
      res.status(403).type("text/plain").send("Acces reserve au reseau interne de la commune.");
      return;
    }
    if (!isAdminPath(req.path) && !isStaticAsset(req.path)) {
      res.redirect("/admin/login");
      return;
    }
    next();
    return;
  }

  if (isAdminPath(req.path)) {
    res.status(404).render("public/404", { title: "Page introuvable" });
    return;
  }

  next();
}

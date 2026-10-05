/**
 * Verrouillage temporaire anti brute-force, en memoire processus.
 * Complements du rate-limiter IP : un attaquant ne peut pas marteler
 * un identifiant precis meme en tournant les adresses (dans la limite
 * d'une instance Node). Redemarrage = compteurs a zero (acceptable
 * pour une mairie, le rate-limit IP reste actif).
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

interface Bucket {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const buckets = new Map<string, Bucket>();

function keyFor(ip: string, username: string): string {
  return `${ip}|${username.trim().toLowerCase()}`;
}

function pruneExpired(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.lockedUntil < now && now - bucket.firstFailureAt > WINDOW_MS) {
      buckets.delete(key);
    }
  }
}

export function isLoginLocked(ip: string, username: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(keyFor(ip, username));
  if (!bucket) return false;
  return bucket.lockedUntil > now;
}

export function registerLoginFailure(ip: string, username: string): void {
  const now = Date.now();
  pruneExpired(now);
  const key = keyFor(ip, username);
  const current = buckets.get(key);

  if (!current || now - current.firstFailureAt > WINDOW_MS) {
    buckets.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }

  current.failures += 1;
  if (current.failures >= MAX_FAILURES) {
    current.lockedUntil = now + WINDOW_MS;
  }
}

export function registerLoginSuccess(ip: string, username: string): void {
  buckets.delete(keyFor(ip, username));
}

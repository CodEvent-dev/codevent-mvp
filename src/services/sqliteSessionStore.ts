/**
 * Store de session "maison" pour express-session, base sur la MEME
 * connexion SQLite (module natif `node:sqlite`) que le reste de
 * l'application.
 *
 * Pourquoi ne pas utiliser "connect-sqlite3" ? Ce paquet embarque une
 * dependance native SQLite tierce ("sqlite3"), ce qui alourdit
 * l'installation et introduit un risque de compilation sur un
 * hebergement mutualise. Cette implementation, volontairement
 * minimale (~80 lignes), evite toute dependance supplementaire tout
 * en respectant l'interface standard `express-session.Store`.
 */
import session, { SessionData } from "express-session";
import { db } from "../config/database";

// Table dediee aux sessions (separee des donnees metier "signalements").
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at)`);

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h par defaut si aucun cookie.maxAge

function resolveExpiresAt(sessionData: SessionData): number {
  const maxAge = sessionData.cookie?.maxAge ?? DEFAULT_MAX_AGE_MS;
  return Date.now() + maxAge;
}

export class SqliteSessionStore extends session.Store {
  private readonly getStmt = db.prepare(
    "SELECT sess, expires_at FROM sessions WHERE sid = ?"
  );
  private readonly upsertStmt = db.prepare(`
    INSERT INTO sessions (sid, sess, expires_at) VALUES (@sid, @sess, @expires_at)
    ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires_at = excluded.expires_at
  `);
  private readonly destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
  private readonly touchStmt = db.prepare(
    "UPDATE sessions SET expires_at = ? WHERE sid = ?"
  );
  private readonly cleanupExpiredStmt = db.prepare(
    "DELETE FROM sessions WHERE expires_at < ?"
  );

  get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): void {
    try {
      const row = this.getStmt.get(sid) as { sess: string; expires_at: number } | undefined;

      if (!row || row.expires_at < Date.now()) {
        if (row) this.destroyStmt.run(sid); // session expiree : nettoyage immediat
        callback(null, null);
        return;
      }

      callback(null, JSON.parse(row.sess) as SessionData);
    } catch (error) {
      callback(error);
    }
  }

  set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): void {
    try {
      this.upsertStmt.run({
        sid,
        sess: JSON.stringify(sessionData),
        expires_at: resolveExpiresAt(sessionData),
      });

      // Nettoyage opportuniste et peu couteux des sessions expirees
      // (evite d'accumuler indefiniment des lignes mortes en base).
      if (Math.random() < 0.02) {
        this.cleanupExpiredStmt.run(Date.now());
      }

      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  destroy(sid: string, callback?: (err?: unknown) => void): void {
    try {
      this.destroyStmt.run(sid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  }

  touch(sid: string, sessionData: SessionData, callback?: () => void): void {
    try {
      this.touchStmt.run(resolveExpiresAt(sessionData), sid);
      callback?.();
    } catch {
      callback?.();
    }
  }
}

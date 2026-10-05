-- =============================================================
-- MairieConnect - Schema SQLite
-- Modele minimaliste, requetes directes (pas d'ORM lourd).
-- Index cibles sur les colonnes de tri/filtrage frequentes du
-- tableau de bord agent (economie CPU/energie sur les requetes).
-- =============================================================

PRAGMA foreign_keys = ON;

-- Comptes des agents municipaux (espace prive) : declare en premier
-- car les signalements peuvent pointer vers un agent assigne.
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,            -- Haché bcrypt (jamais le mot de passe en clair)
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'admin')),
  active INTEGER NOT NULL DEFAULT 1,      -- 0 = compte desactive (session refusee)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_username ON agents (username);

-- Specialites / services rattaches a un agent (N-N).
-- Un agent voirie ne voit que les tickets dont assigned_service
-- figure ici. Un admin/maire n'a pas besoin de lignes : vue globale.
CREATE TABLE IF NOT EXISTS agent_specialties (
  agent_id TEXT NOT NULL,
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (agent_id, category),
  FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agent_specialties_category
  ON agent_specialties (category);

-- Table principale des signalements citoyens
CREATE TABLE IF NOT EXISTS signalements (
  id TEXT PRIMARY KEY,                    -- UUID genere en application (crypto.randomUUID)
  reference_code TEXT NOT NULL,           -- Code de suivi lisible, ex: TIGY-8492
  category TEXT NOT NULL,                 -- Categorie declaree par le citoyen
  description TEXT,                       -- Description courte fournie par le citoyen
  photo_path TEXT,                        -- Chemin relatif securise du fichier photo stocke
  latitude REAL,                          -- Coordonnee GPS optionnelle
  longitude REAL,                         -- Coordonnee GPS optionnelle
  address TEXT,                           -- Adresse textuelle saisie ou deduite
  status TEXT NOT NULL DEFAULT 'nouveau'
    CHECK (status IN ('nouveau', 'pris_en_compte', 'en_cours', 'resolu', 'rejete')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  internal_notes TEXT,                    -- Journal des notes internes agents (jamais expose au public)
  anonymized INTEGER NOT NULL DEFAULT 0,  -- 1 si purge RGPD deja appliquee
  reporter_ip_hash TEXT,                  -- Empreinte (hash) de l'IP, uniquement anti-spam, jamais l'IP brute
  -- Routage interne (jamais expose au citoyen)
  assigned_service TEXT,                  -- Service retenu par le routeur (peut differer de category si "autre")
  assigned_agent_id TEXT,                 -- Agent specialiste designe (charge la plus faible)
  routing_score REAL,                     -- Score de confiance 0..1 du classifieur local
  routing_reason TEXT,                    -- Explication lisible (audit, pas de boite noire)
  routing_source TEXT,                    -- citizen | ai | manual
  routed_at TEXT,
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
);

-- Recherche du statut public par code de suivi : tres frequente, doit rester rapide
CREATE UNIQUE INDEX IF NOT EXISTS idx_signalements_reference_code
  ON signalements (reference_code);

-- Filtres/tri du tableau de bord agent
CREATE INDEX IF NOT EXISTS idx_signalements_status ON signalements (status);
CREATE INDEX IF NOT EXISTS idx_signalements_category ON signalements (category);
CREATE INDEX IF NOT EXISTS idx_signalements_created_at ON signalements (created_at);
-- Les index assigned_* sont crees dans migrate.ts, apres ajout
-- eventuel des colonnes sur une base deja existante.

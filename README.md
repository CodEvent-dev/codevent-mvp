# MairieConnect

Application web souveraine, legere et securisee de signalement citoyen
(voirie, eclairage, proprete, espaces verts, batiments communaux) avec
tableau de bord interne, comptes agents par specialite et routage local.

Concue pour etre livree **cle en main** a une collectivite : code
propriétaire, hebergement 100% France (type o2switch), zero dependance
a des services cloud tiers non europeens.

---

## 1. Stack technique

| Composant   | Choix                              | Pourquoi |
|-------------|-------------------------------------|----------|
| Backend     | Node.js + Express (TypeScript)      | Leger, tres rapide, faible usage CPU |
| Base de donnees | SQLite (module natif `node:sqlite`, Node >= 22.5) | Requetes SQL directes et indexees, pas d'ORM lourd, **zero dependance native a compiler** |
| Frontend    | HTML + EJS (rendu serveur) + Tailwind CSS compile localement | Pages instantanees, JS minimal |
| Images      | Compression client (canvas) + re-encodage serveur (`jimp`, 100% JS) | Leger, portable, securise |
| Sessions    | `express-session` + store SQLite maison (`node:sqlite`) | Pas de Redis, pas de 2e moteur SQLite |
| Export      | CSV natif + `pdfkit` (pur JS)        | Pas de navigateur headless |

Aucun CDN externe (pas de Google Fonts, pas de script tiers) : toutes
les ressources statiques (CSS/JS) sont servies depuis le serveur.

> **Note** : au demarrage, Node.js peut afficher un avertissement
> `ExperimentalWarning: SQLite is an experimental feature` dans la
> console. Ce message est purement informatif (l'API `node:sqlite`
> utilisee est stable dans son usage synchrone) et n'affecte pas le
> fonctionnement de l'application.

---

## 2. Installation (developpement local)

Prerequis : **Node.js >= 22.5** et npm installes sur la machine (requis
pour le module natif `node:sqlite` utilise comme base de donnees).

```bash
# 1. Installer les dependances
npm install

# 2. Copier le fichier d'environnement et l'adapter
cp .env.example .env
# -> Editer .env : SESSION_SECRET, COMMUNE_NAME, ADMIN_DEFAULT_PASSWORD, etc.

# 3. Compiler le CSS (Tailwind) une premiere fois
npm run build:css

# 4. Initialiser la base de donnees et le compte admin par defaut
npm run db:seed

# 5. Lancer le serveur en mode developpement (rechargement auto)
npm run dev
```

En local, les deux espaces sont sur la meme adresse (pratique pour le
developpement). Des la mise en ligne, ils doivent etre separes : voir
la section 4.

- `http://localhost:3000/` : espace citoyen (formulaire de signalement)
- `http://localhost:3000/suivi` : suivi d'un signalement par code
- `http://localhost:3000/admin/login` : espace agent (identifiants dans `.env`)

**Important** : changez le mot de passe administrateur par defaut des
la premiere connexion (il n'existe aucune interface de changement de
mot de passe dans ce MVP : mettez a jour le hash directement en base
ou recreez le compte via `npm run db:seed` apres modification de
`ADMIN_DEFAULT_PASSWORD` dans `.env` sur une base vide).

---

## 3. Build et execution en production

```bash
npm install --omit=dev   # dependances de production uniquement
npm run build            # compile le CSS puis le TypeScript (dist/)
npm run db:seed          # une seule fois, a la premiere installation
npm start                # lance dist/server.js
```

Le serveur ecoute sur le port defini par `PORT` (par defaut 3000). En
production, il doit **toujours** etre place derriere un reverse-proxy
HTTPS (voir section suivante) : `NODE_ENV=production` active alors le
cookie de session en mode `secure` (HTTPS uniquement).

---

## 4. Mise en ligne : site citoyen public, agents en interne

Un seul programme Node.js tourne sur le serveur. Deux adresses
distinctes le rejoignent. Le citoyen et l'agent n'utilisent pas la
meme URL.

| Qui | Adresse | Ce qu'il voit |
|-----|---------|----------------|
| Habitant, depuis Internet | `https://signalement.ma-commune.fr` | Formulaire, suivi, mentions legales |
| Agent, depuis le reseau de la mairie | `https://agents.ma-commune.lan` | Connexion, tableau de bord, exports |

Sur l'adresse publique, `/admin` repond « page introuvable ». La page
de connexion n'est pas annoncee sur Internet. Sur l'adresse interne,
ouvrir le site amene directement a la connexion agent. Un filtre
d'adresses IP peut en plus n'accepter que le reseau de la mairie.

### 4.1. Reglages dans `.env` (production)

```bash
NODE_ENV=production
TRUST_PROXY_HOPS=1
PUBLIC_HOST=signalement.ma-commune.fr
ADMIN_HOST=agents.ma-commune.lan
ADMIN_ALLOWED_IPS=10.0.0.0/8,192.168.0.0/16
```

- `PUBLIC_HOST` : nom exact du site citoyen (sans `https://`).
- `ADMIN_HOST` : nom exact de l'espace agent. Tant qu'il est vide,
  les deux espaces restent sur la meme adresse (reserve au poste de
  developpement).
- `ADMIN_ALLOWED_IPS` : IP fixes ou reseaux CIDR IPv4 autorises a
  ouvrir l'espace agent. Laisser vide desactive le filtre. En
  production, y mettre le reseau interne (ou l'IP publique fixe de
  la mairie si les agents sortent par une box).

Les noms doivent etre ceux envoyes par le navigateur (en-tete
`Host`), pas l'adresse IP du serveur.

### 4.2. Cote citoyen, ouvert sur Internet

1. Chez le registrar ou dans la zone DNS de la commune, creer un
   enregistrement `signalement.ma-commune.fr` vers l'hebergement
   francais (o2switch ou equivalent).
2. Activer le certificat HTTPS (Let's Encrypt dans cPanel).
3. Dans le vhost Apache public, transmettre tout le trafic au
   processus Node, et interdire `/admin` meme si la configuration
   applicative etait oubliee :

```apache
<VirtualHost *:443>
    ServerName signalement.ma-commune.fr
    SSLEngine on

    # Le citoyen ne doit jamais atteindre l'espace agent.
    RedirectMatch 404 ^/admin

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

`ProxyPreserveHost On` est indispensable : l'application lit le nom
`signalement.ma-commune.fr` pour savoir qu'elle parle a un citoyen.

Les pages utiles au public :

- `https://signalement.ma-commune.fr/` formulaire
- `https://signalement.ma-commune.fr/suivi` suivi par code
- `https://signalement.ma-commune.fr/mentions-legales`

### 4.3. Cote agent, uniquement en interne

Ne pas publier `ADMIN_HOST` dans le DNS public. Trois montages
possibles, du plus ferme au plus simple :

1. **Reseau de la mairie ou VPN (recommande).** Le nom
   `agents.ma-commune.lan` n'existe que dans le DNS interne (Active
   Directory, box pro, ou fichier hosts des postes agents). Le vhost
   n'ecoute pas sur Internet. Apache limite en plus les IP :

```apache
<VirtualHost 10.0.0.5:443>
    ServerName agents.ma-commune.lan
    SSLEngine on

    <Location />
        Require ip 10.0.0.0/8 192.168.0.0/16
    </Location>

    ProxyPreserveHost On
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

   Les agents ouvrent `https://agents.ma-commune.lan` : ils arrivent
   sur la connexion. Identifiants du compte cree au premier
   demarrage (`ADMIN_DEFAULT_USERNAME` / mot de passe change).

2. **Poste de la mairie sans DNS interne.** Sur chaque PC agent,
   fichier `C:\Windows\System32\drivers\etc\hosts` :

```text
10.0.0.5    agents.ma-commune.lan
```

   `10.0.0.5` est l'adresse du serveur vue depuis le reseau local,
   pas l'adresse publique du site citoyen.

3. **Secours si aucun nom interne n'est possible.** Un sous-domaine
   non communique (`agents.ma-commune.fr`) avec certificat HTTPS,
   `ADMIN_ALLOWED_IPS` limite a l'IP de la mairie, et pas de lien
   depuis le site public. C'est moins ferme qu'un reseau ferme :
   l'adresse existe sur Internet, seule l'IP autorisee entre.

Depuis l'adresse interne, `/`, `/suivi` et le formulaire citoyen ne
sont pas servis : tout renvoie vers la connexion agent. Les fichiers
techniques (CSS, photos) restent disponibles, sinon les pages agent
ne s'afficheraient pas.

### 4.4. Hebergement o2switch (ou equivalent)

1. **Node.js** : dans cPanel, « Node.js Selector », version >= 22.5,
   fichier d'entree `dist/server.js`. Une seule application Node pour
   les deux adresses.
2. **Variables** : les cles de `.env.example`, y compris
   `PUBLIC_HOST`, `ADMIN_HOST`, `ADMIN_ALLOWED_IPS` et
   `TRUST_PROXY_HOPS=1`.
3. **HTTPS** : Let's Encrypt sur le nom public. Pour le nom interne,
   un certificat de la collectivite ou un Let's Encrypt seulement si
   ce nom est resolu publiquement (cas 3 ci-dessus).
4. **Base** : `data/mairieconnect.db` sur le disque de l'hebergeur.
   Sauvegarde reguliere (cPanel ou copie cron).
5. **Photos** : `data/uploads/` (hors dossier public). A sauvegarder
   aussi. Elles sont servies par l'application, pas en acces direct.
6. **Purge RGPD** : tache interne a 3 h tant que Node tourne. En
   complement, cron cPanel : `npm run purge:run`.
7. **SQLite** : module natif `node:sqlite`. Aucune compilation au
   `npm install`. Il faut Node >= 22.5 dans le selecteur.

Verifier apres mise en ligne :

- depuis un telephone hors Wi-Fi mairie :
  `https://signalement.ma-commune.fr/` s'affiche, et
  `https://signalement.ma-commune.fr/admin` repond 404 ;
- depuis un poste de la mairie :
  `https://agents.ma-commune.lan` ouvre la connexion agent ;
- depuis Internet, cette seconde adresse ne repond pas.

---

## 5. Securite mise en oeuvre

- **En-tetes HTTP** : `helmet` avec une politique CSP stricte
  (`default-src 'self'`) : aucune ressource tierce ne peut etre chargee.
- **Injections SQL** : 100% requetes preparees (`better-sqlite3`),
  aucune concatenation de chaine SQL.
- **XSS** : echappement automatique de toutes les sorties utilisateur
  via les templates EJS (`<%= %>`).
- **CSRF** : jeton de synchronisation stocke en session, verifie sur
  toute requete de mutation (POST/PUT/PATCH/DELETE).
- **Mots de passe** : haches avec bcrypt (12 rounds), jamais stockes ni
  logges en clair.
- **Uploads d'images** : verification de la signature binaire reelle du
  fichier (independamment de l'extension/mimetype fournis), puis
  decodage + **re-encodage integral** de l'image (toute donnee ou script
  cache dans le fichier d'origine est ainsi neutralise), limite de
  taille et de dimensions.
- **Sessions** : cookie `httpOnly`, `sameSite=strict`, `secure` en
  production, duree de vie limitee, regeneration de session a la
  connexion (anti fixation de session).
- **Rate limiting** : limite les tentatives de connexion et les
  creations de signalements par IP.
- **Deux acces** : l'espace agent n'est servi que sur `ADMIN_HOST`,
  et seulement depuis les IP listees dans `ADMIN_ALLOWED_IPS`.
  Sur le site public, `/admin` est une page introuvable.

---

## 6. Conformite RGPD

- Aucune creation de compte citoyen : uniquement un code de suivi
  aleatoire (`TIGY-8492`).
- Donnees minimales collectees (categorie, adresse/GPS, description et
  photo facultatives).
- Adresse IP jamais stockee en clair (uniquement un hash technique
  anti-spam).
- Purge/anonymisation automatique des signalements resolus/rejetes
  apres `DATA_RETENTION_DAYS` jours (365 par defaut, configurable) :
  suppression de la photo, description, notes internes et coordonnees
  precises, conservation uniquement de metadonnees statistiques.
- Aucun cookie publicitaire ou de tracage : uniquement le cookie
  technique de session agent.
- Page `/mentions-legales` explicitant ces engagements pour les usagers.

---

## 7. Structure du projet

```
src/
  config/       Chargement env + connexion base de donnees
  db/           Schema SQL + script de seed
  models/       Acces aux donnees (requetes SQL preparees)
  domain/       Catalogue des categories / services municipaux
  services/     Logique metier (signalements, auth, upload, export, purge, routage)
  services/routing/  Classifieur local texte + indices photo + affectation
  controllers/  Gestion des requetes HTTP (publics vs admin separes)
  routes/       Declaration des routes Express
  middlewares/  Auth, CSRF, rate-limit, gestion d'erreurs, upload
  utils/        Validation (zod), generation de code, erreurs
views/
  public/       Pages citoyennes (EJS)
  admin/        Pages agent (EJS)
  partials/     En-tetes/pieds de page communs
public/
  css/          CSS Tailwind compile (genere par npm run build:css)
  js/           JavaScript vanilla (formulaire, compression image)
data/
  mairieconnect.db   Base SQLite (generee au premier lancement)
  uploads/           Photos des signalements (hors web public)
```

---

## 8. Commandes disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de developpement avec rechargement auto |
| `npm run build` | Compile le CSS puis le TypeScript vers `dist/` |
| `npm start` | Lance le serveur compile (production) |
| `npm run db:seed` | Cree le schema et le compte admin par defaut |
| `npm run purge:run` | Execute immediatement la purge RGPD (CLI) |
| `npm run typecheck` | Verifie les types sans compiler |

---

## 9. Agents par specialite et routage local

La stack reste **Node.js / TypeScript**. Un second runtime Python ou Go
ajouterait un processus, une surface d'attaque et de la consommation
inutile : le traitement tient dans le serveur deja en place.

### Donnees

- `agents` : compte interne (`agent` ou `admin`), flag `active`.
- `agent_specialties` : N-N agent / categorie (voirie, eclairage,
  proprete, espaces verts, batiments, autre).
- `signalements` : `assigned_service`, `assigned_agent_id`, score,
  explication et source du routage (`citizen` | `ai` | `manual`).

Un administrateur / maire voit tous les tickets. Un agent ne voit que
ceux dont le service assigne figure dans ses specialites. Les controles
sont refaits a chaque requete (liste, detail, notes, statut, exports).

### Algorithme (100 % local, zero e-mail, zero cloud)

1. Lexique municipal pondere sur la description, la precision "Autre"
   et l'adresse (accents ignores, locutions du type "nid de poule").
2. Leger bonus visuel si photo : echantillon de pixels (vert vegetal,
   gris enrobe, scene sombre).
3. Prior citoyen : une categorie precise pese lourd ; "Autre" laisse
   le classifieur decider.
4. Affectation a l'agent specialiste le moins charge (tickets ouverts).
   Si aucun specialiste n'existe, le ticket reste visible aux admins
   et aux agents du service.

L'explication est enregistree sur le ticket (`routing_reason`) et
visible dans le back-office. Un admin peut reaffecter a la main.

Gestion des comptes : `/admin/agents` (administrateurs seulement).

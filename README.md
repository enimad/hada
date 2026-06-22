# Hada

Hada est une web app beta de wedding planner IA. Elle aide un couple a structurer son projet de mariage, discuter avec Hada, rechercher des prestataires et preparer les premiers contacts.

## Etat actuel

Le socle produit disponible dans ce depot couvre:

- accueil public avec routage email vers inscription ou connexion
- landing page publique sur `/`
- blog SEO sur `/blog` avec articles Markdown programmes
- administration Decap CMS sur `/admin`
- authentification Supabase email/password avec confirmation email
- connexion Google via Supabase OAuth
- onboarding mariage en 5 etapes
- page `Mon mariage` editable
- chat Hada persistant avec contexte mariage
- moteur experimental `chat-v2` sur `/chat-v2` et `/api/chat-v2`
- pages `Budget` et `Mon offre`
- recherche de prestataires depuis le chat
- recherche web Firecrawl avec rotation de cles et fallback catalogue local
- normalisation de fiches prestataires via Mistral
- pages de selection et de detail prestataire
- brouillon email de contact via `mailto:`
- journalisation des prises de contact
- popup survey avec questions produit et pricing

Le depot local est aligne avec `origin/main` sur `git@github.com:enimad/hada.git`.

## Stack

- Frontend: Next.js App Router + TypeScript
- UI: Tailwind CSS
- Auth et database: Supabase
- Chat IA: Mistral API
- Orchestration chat-v2: Google + fallback Mistral
- Recherche web: Firecrawl
- CMS blog: Decap CMS + GitHub OAuth
- Email survey optionnel: Resend

## Commandes

```powershell
npm install
npm run dev
npm run typecheck
npm run build
```

Note: aucun lint automatisable n'est configure pour le moment. L'ancien `next lint` a ete retire car il est deprecie et ouvrait une configuration interactive.

En développement, `npm run dev` lance aussi le proxy Decap local sur le port `8081`. `/admin` fonctionne alors sans OAuth GitHub et écrit directement dans `content/blog`. En production, Decap utilise les variables OAuth GitHub ci-dessous.

## Variables d'environnement

Copier `.env.example` vers `.env.local`.

Variables requises:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`

Variables optionnelles:

- `GOOGLE_API_KEY`
- `GOOGLE_MODEL`
- `DECAP_GITHUB_CLIENT_ID`
- `DECAP_GITHUB_CLIENT_SECRET`
- `FIRECRAWL_API_KEY`
- `FIRECRAWL_API_KEYS`
- `MISTRAL_VENDOR_PROFILE_AGENT_ID`
- `MISTRAL_VENDOR_PROFILE_AGENT_VERSION`
- `RESEND_API_KEY`
- `SURVEY_NOTIFY_TO`
- `SURVEY_NOTIFY_FROM`

## Supabase

Le schema de reference est [supabase/schema.sql](supabase/schema.sql).

Les routes serveur utilisent aujourd'hui la `SUPABASE_SERVICE_ROLE_KEY`; les tables ont RLS activee, mais les policies utilisateur fines restent a durcir avant une montee en charge.

## Documentation

- [docs/setup.md](docs/setup.md): reprise locale
- [docs/deploy.md](docs/deploy.md): deploiement Vercel, Supabase, OAuth
- [docs/chat-v2-engine.md](docs/chat-v2-engine.md): architecture du moteur chat-v2
- [docs/decap-cms-setup.md](docs/decap-cms-setup.md): configuration Decap/GitHub OAuth
- [docs/decap-cms-editor-guide.md](docs/decap-cms-editor-guide.md): publication d'articles blog
- [docs/system-architecture.md](docs/system-architecture.md): architecture actuelle
- [docs/database-schema.md](docs/database-schema.md): schema Supabase utilise
- [docs/mvp-api.md](docs/mvp-api.md): routes API reelles
- [docs/conversation-flows.md](docs/conversation-flows.md): flux chat et recherche
- [docs/product-blueprint.md](docs/product-blueprint.md): positionnement produit
- [docs/roadmap.md](docs/roadmap.md): priorites restantes

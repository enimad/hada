# Setup Local

Ce guide sert a reprendre Hada en local depuis ce depot.

## Prerequis

- Node.js compatible avec Next.js 15
- npm
- un projet Supabase
- une cle Mistral

Le depot Git pointe vers `git@github.com:enimad/hada.git`.

## Installation

```powershell
npm install
```

Lancer le serveur local:

```powershell
npm run dev
```

Le script `dev` utilise [scripts/dev-next.mjs](../scripts/dev-next.mjs) et demarre Next sur `localhost:3000` par defaut.

## Variables d'environnement

Dupliquer [.env.example](../.env.example) en `.env.local`, puis renseigner:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000

NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta_cle_anon
SUPABASE_SERVICE_ROLE_KEY=ta_cle_service_role

MISTRAL_API_KEY=ta_cle_mistral
MISTRAL_MODEL=mistral-large-latest
```

Variables optionnelles:

```env
FIRECRAWL_API_KEY=
FIRECRAWL_API_KEYS=

RESEND_API_KEY=
SURVEY_NOTIFY_TO=
SURVEY_NOTIFY_FROM=
```

`FIRECRAWL_API_KEYS` accepte plusieurs cles separees par virgules, points-virgules ou retours ligne. Hada les utilise avec rotation automatique si une cle est limitee ou sans credit.

## Supabase

1. Creer ou ouvrir le projet Supabase Hada.
2. Recuperer `Project URL`, `anon public key` et `service_role secret key`.
3. Executer le contenu complet de [supabase/schema.sql](../supabase/schema.sql) dans `Supabase > SQL Editor`.
4. Verifier que les tables principales existent:
   - `wedding_profiles`
   - `conversations`
   - `messages`
   - `vendor_requests`
   - `vendor_candidates`
   - `outreach_threads`
   - `outreach_messages`
   - `survey_responses`

Si une route retourne une erreur du type `public.wedding_profiles` ou `survey_responses` introuvable, le schema SQL n'a probablement pas ete execute sur le projet Supabase utilise par `.env.local`.

## Supabase Auth

Configurer `Authentication > URL Configuration`:

- Site URL local: `http://localhost:3000`
- Redirect URLs locales:
  - `http://localhost:3000/auth/continue`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/login?confirmed=1`

Pour Google OAuth, le redirect URI Google doit pointer vers Supabase:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Hada redirige ensuite vers `/auth/continue`.

## Verifications

```powershell
npm run typecheck
npm run build
```

`npm run lint` n'existe plus: aucun lint automatisable n'est configure aujourd'hui.

## Notes de securite

Les tables ont RLS activee, mais les routes serveur utilisent actuellement la `SUPABASE_SERVICE_ROLE_KEY` apres validation du bearer token Supabase. Avant une montee en charge, il faudra ajouter des policies RLS fines et limiter les operations service role au strict necessaire.

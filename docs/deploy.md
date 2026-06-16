# Deploy Hada

Guide de deploiement pour `Vercel + Supabase + Mistral + Firecrawl`.

## Variables Vercel

Variables requises:

```env
NEXT_PUBLIC_APP_URL=https://ton-domaine-public.com

NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta_cle_anon
SUPABASE_SERVICE_ROLE_KEY=ta_cle_service_role

MISTRAL_API_KEY=ta_cle_mistral
MISTRAL_MODEL=mistral-large-latest
```

Variables optionnelles:

```env
GOOGLE_API_KEY=
GOOGLE_MODEL=gemini-2.5-flash

FIRECRAWL_API_KEY=
FIRECRAWL_API_KEYS=

RESEND_API_KEY=
SURVEY_NOTIFY_TO=
SURVEY_NOTIFY_FROM=

MISTRAL_VENDOR_PROFILE_AGENT_ID=
MISTRAL_VENDOR_PROFILE_AGENT_VERSION=

DECAP_GITHUB_CLIENT_ID=
DECAP_GITHUB_CLIENT_SECRET=
```

Si `FIRECRAWL_API_KEY` et `FIRECRAWL_API_KEYS` sont absentes, Hada utilise uniquement le catalogue local de fallback. Si Resend n'est pas configure, les surveys sont stockes en base mais aucun email de notification n'est envoye.

## Supabase

Executer [supabase/schema.sql](../supabase/schema.sql) dans `Supabase > SQL Editor`.

Tables utilisees par l'app:

- `wedding_profiles`
- `conversations`
- `messages`
- `vendor_requests`
- `vendor_candidates`
- `outreach_threads`
- `outreach_messages`
- `survey_responses`

## Supabase Auth

Dans `Supabase > Authentication > URL Configuration`:

- `Site URL` :
  - local : `http://localhost:3000`
  - prod : `https://hadawedding.fr`
- `Redirect URLs` :
  - `http://localhost:3000/auth/continue`
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/login?confirmed=1`
  - `https://hadawedding.fr/auth/continue`
  - `https://hadawedding.fr/auth/callback`
  - `https://hadawedding.fr/login?confirmed=1`

Conserver aussi les URLs localhost si les tests locaux utilisent le meme projet Supabase.

## Google OAuth

Dans `Supabase > Authentication > Providers > Google`:

- activer Google
- renseigner le `Client ID`
- renseigner le `Client Secret`

Dans Google Cloud Console, l'URI autorisee doit etre:

```text
https://<project-ref>.supabase.co/auth/v1/callback
```

Le flux est: Google -> Supabase -> Hada `/auth/continue`.

## Vercel

Option recommandee:

1. Connecter le repo GitHub `enimad/hada`.
2. Ajouter les variables d'environnement.
3. Deployer depuis `main`.

Build command:

```bash
npm run build
```

Start command:

```bash
npm run start
```

## Verification Post-Deploiement

Verifier ce parcours:

1. arriver sur `https://hadawedding.fr`
2. tester Google OAuth
3. tester inscription email + confirmation
4. completer l'onboarding
5. ouvrir le chat
6. demander une recherche de lieu
7. verifier l'apparition de candidats dans `/vendors` et `/venues`
8. ouvrir une fiche lieu
9. preparer un contact
10. quitter la fiche et verifier le popup survey
11. verifier `survey_responses` dans Supabase

## Points De Vigilance

- `middleware.ts` redirige `hada-wp.vercel.app` vers `https://hadawedding.fr`.
- Les recherches beta sont limitees a 2 recherches par fenetre de 48h par utilisateur.
- Les contacts prestataires ouvrent un `mailto:` et journalisent un brouillon; il n'y a pas encore d'envoi email serveur vers les prestataires.
- Les policies RLS restent a renforcer avant un usage public large.

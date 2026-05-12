# Deploy Hada

Ce guide permet de mettre Hada en ligne proprement avec `Vercel + Supabase + Mistral`.

## 1. Variables d'environnement

Configurer ces variables dans Vercel :

```env
NEXT_PUBLIC_APP_URL=https://hadawedding.fr

NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ta_cle_anon
SUPABASE_SERVICE_ROLE_KEY=ta_cle_service_role

MISTRAL_API_KEY=ta_cle_mistral
MISTRAL_MODEL=mistral-large-latest
```

## 2. Base de donnees Supabase

Avant le premier deploiement :

1. Ouvrir `Supabase > SQL Editor`
2. Executer le contenu de [supabase/schema.sql](C:\Users\amine\Documents\Codex\2026-04-26\j-ai-un-projet-de-web-2\supabase\schema.sql)

Tables MVP deja utilisees par Hada :

- `wedding_profiles`
- `conversations`
- `messages`
- `vendor_requests`
- `vendor_candidates`
- `outreach_threads`
- `outreach_messages`

## 3. Configuration Supabase Auth

Dans `Supabase > Authentication > URL Configuration` :

- `Site URL` :
  - local : `http://localhost:3000`
  - prod : `https://hadawedding.fr`
- `Redirect URLs` :
  - `http://localhost:3000/auth/continue`
  - `http://localhost:3000/auth/callback`
  - `https://hadawedding.fr/auth/continue`
  - `https://hadawedding.fr/auth/callback`
  - `http://localhost:3000/login?confirmed=1`
  - `https://hadawedding.fr/login?confirmed=1`

## 4. Configuration Google OAuth

Dans `Supabase > Authentication > Providers > Google` :

- activer Google
- renseigner `Client ID`
- renseigner `Client Secret`

Dans `Google Cloud Console` :

- `Authorized redirect URI` :
  - `https://<project-ref>.supabase.co/auth/v1/callback`

Important :

- le callback Google pointe vers Supabase
- puis Supabase redirige vers Hada avec `redirectTo`
- Hada utilise maintenant `/auth/continue` comme point d'entree fiable apres OAuth

## 5. Deploiement Vercel

Option recommandee :

1. connecter le repo GitHub `enimad/hada` a Vercel
2. ajouter les variables d'environnement
3. lancer le deploiement

Build command :

```bash
npm run build
```

Start command :

```bash
npm run start
```

## 6. Verification post-deploiement

Verifier ce parcours :

1. accueil
2. connexion Google
3. inscription email + confirmation email
4. onboarding
5. ouverture du chat Hada
6. demande de recherche de lieu
7. affichage des lieux dans `/venues`
8. ouverture d'une fiche lieu
9. clic sur `Contacter`
10. ouverture de la boite mail par defaut avec sujet + corps pre-remplis

## 7. Perimetre MVP public

Le socle public est pret pour un lancement beta centre sur `lieux` :

- auth email et Google
- onboarding mariage
- chat Hada persistant
- recommandations dynamiques stockees en base
- fiche prestataire
- contact email + journalisation

Les autres categories de prestataires peuvent ensuite etre etendues sur la meme architecture.

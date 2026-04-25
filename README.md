# Hada

MVP de web app pour accompagner un couple dans l'organisation de son mariage avec Hada:

- authentification
- onboarding mariage
- chat IA contextualise
- qualification du besoin prestataire
- recherche de prestataires
- prise de contact assistee

## Stack retenue

- Frontend: Next.js App Router + TypeScript
- UI: Tailwind CSS
- Database: Supabase Postgres
- Auth + Backend data: Supabase
- Chat IA: Mistral AI via API HTTP

## Ce qui est deja dans ce dossier

- squelette Next.js
- pages `login`, `signup`, `onboarding`, `chat`
- route API `profile`
- route API `chat`
- schema SQL Supabase
- documentation produit et architecture

## Variables d'environnement

Copier `.env.example` vers `.env.local`.

Variables requises:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`

## Supabase

Le plus simple est de creer un projet Supabase dedie a Hada.

1. Creer un nouveau projet sur Supabase
2. Recuperer l'URL du projet
3. Recuperer la `anon key`
4. Recuperer la `service role key`
5. Executer le SQL de [supabase/schema.sql](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/supabase/schema.sql)

Guide detaille: [docs/setup.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/setup.md)

## GitHub

Le projet local est initialise en Git et pointe vers `https://github.com/enimad/hada.git`.

Etat actuel:

- commits locaux crees
- remote `origin` configure vers `enimad/hada`
- push GitHub bloque ici par l'authentification HTTPS non interactive du terminal

La suite et les commandes utiles sont dans [docs/setup.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/setup.md)

## Documents produit

- [docs/product-blueprint.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/product-blueprint.md)
- [docs/system-architecture.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/system-architecture.md)
- [docs/database-schema.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/database-schema.md)
- [docs/conversation-flows.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/conversation-flows.md)
- [docs/mvp-api.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/mvp-api.md)
- [docs/roadmap.md](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/docs/roadmap.md)

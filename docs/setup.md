# Setup

## 1. Creer la database

Je te conseille de faire la database directement sur Supabase.

Pourquoi:

- Postgres gere bien les donnees structurees et relationnelles du produit
- l'interface est simple pour demarrer vite
- tu recuperes base SQL, auth, storage et webhooks dans le meme produit
- la connexion avec Next.js est tres fluide
- Supabase Auth peut devenir la source de verite pour les comptes utilisateurs

### Ce qu'il faut creer

1. Va sur [Supabase](https://supabase.com)
2. Cree un nouveau projet
3. Choisis une region proche de tes utilisateurs
4. Dans `Project Settings > API`, recupere:
   - `Project URL`
   - `anon public key`
   - `service_role secret key`
5. Dans `SQL Editor`, colle le contenu de [supabase/schema.sql](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/supabase/schema.sql)

Important:

- les identites utilisateur doivent idealement vivre dans `auth.users`
- les tables metier de ce projet reference deja `auth.users(id)`
- le `demo-user` present dans certaines pages est juste un placeholder de developpement

### Mapping des variables

- `NEXT_PUBLIC_SUPABASE_URL` = Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = anon public key
- `SUPABASE_SERVICE_ROLE_KEY` = service_role secret key

## 2. Configurer Mistral

Comme tu as deja une cle Mistral, il suffit d'ajouter:

- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`

Valeur conseillee pour commencer:

- `MISTRAL_MODEL=mistral-large-latest`

La route [app/api/chat/route.ts](/C:/Users/amine/Documents/Codex/2026-04-26/j-ai-un-projet-de-web-2/app/api/chat/route.ts) appelle directement l'API Mistral via HTTP.

## 3. Creer le repo GitHub

La session GitHub disponible dans Codex est deja connectee, mais ce terminal n'a pas `git` installe.

Fais d'abord:

1. Cree un nouveau repository vide sur GitHub, par exemple `hada`
2. Installe Git sur ta machine si besoin

Ensuite, depuis ce dossier:

```powershell
git init
git branch -M main
git add .
git commit -m "Initial scaffold for Hada"
git remote add origin https://github.com/enimad/hada.git
git push -u origin main
```

## 4. Installer les dependances

Ce terminal n'a pas `npm`, `pnpm` ni `yarn`, donc je n'ai pas pu lancer l'installation ici.

Des que ton environnement local a un package manager:

```powershell
npm install
npm run dev
```

Ou avec pnpm:

```powershell
pnpm install
pnpm dev
```

## 5. Priorite de build

Pour la toute premiere iteration:

1. brancher Supabase Auth
2. remplacer le `demo-user` par le vrai `user.id`
3. persister les conversations
4. ajouter le moteur de qualification pour `lieu`
5. brancher la recherche prestataire

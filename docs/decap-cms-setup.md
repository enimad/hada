# Configuration Decap CMS pour Hada

## Objectif

Decap CMS est disponible sur `/admin`.

- En local, `npm run dev` lance Next.js et le proxy Decap officiel. Aucun identifiant GitHub n'est nécessaire et les articles sont écrits directement dans `content/blog`.
- En production, seule une personne connectée avec un compte GitHub autorisé sur `enimad/hada` peut publier.

## Utilisation locale

Lancer :

```powershell
npm run dev
```

Le même terminal démarre :

- Hada sur `http://localhost:3000` ;
- le proxy Decap local sur `http://localhost:8081`.

Ouvrir ensuite `http://localhost:3000/admin`. Le mode local utilise `git-gateway` avec `local_backend: true` et ne demande pas de connexion GitHub.

`Ctrl+C` dans ce terminal arrête les deux services.

Le workflow éditorial Decap n'est pas disponible avec le proxy local. Il reste activé en production.

## Variables Vercel nécessaires

Créer une OAuth App GitHub, puis ajouter dans Vercel :

```dotenv
DECAP_GITHUB_CLIENT_ID=...
DECAP_GITHUB_CLIENT_SECRET=...
```

Callback URL GitHub à configurer :

```text
https://hadawedding.fr/api/decap/callback
```

Homepage URL GitHub :

```text
https://hadawedding.fr
```

## Fonctionnement

- Decap lit sa configuration dans `/admin/config.yml`.
- Les articles sont stockés dans `content/blog`.
- Les images uploadées sont stockées dans `public/uploads/blog`.
- Les articles avec `draft: true` ne sont pas affichés.
- Les articles avec une date `publishedAt` future ne sont pas affichés avant cette date.

## Sécurité

- `open_authoring` n'est pas activé.
- `/admin` est en `noindex`.
- `/admin` est bloqué dans `robots.txt`.
- La vraie autorisation dépend des droits GitHub sur le repo.

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

En local, enregistrer ou publier dans Decap modifie directement `content/blog` et `public/uploads/blog`, mais ne crée pas de commit Git. Ces fichiers doivent être commités puis poussés pour apparaître sur le site déployé.

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

## Publication en production

Depuis `/admin`, publier un article ne modifie pas directement le site : Decap
fusionne l'article dans la branche `main` du dépôt `enimad/hada`.

Le blog lit les articles depuis les fichiers `content/blog` embarqués au moment
du déploiement. Un article n'apparaît donc en ligne qu'après un nouveau
déploiement.

Le projet Vercel est connecté au dépôt GitHub : chaque fusion dans `main`
déclenche automatiquement un déploiement de production. L'article est en ligne
environ deux minutes après la publication, sans action manuelle.

Points de vigilance :

- la branche de production Vercel doit rester `main` ;
- le workflow éditorial de Decap crée une branche `cms/blog/...` et une pull
  request : celle-ci génère un déploiement de prévisualisation, et seule la
  fusion dans `main` met le site à jour ;
- si un déploiement manuel `vercel --prod` est lancé depuis un dossier local en
  retard sur GitHub, il remet en ligne une version sans les derniers articles.
  Faire `git pull` avant tout déploiement manuel.

## Sécurité

- `open_authoring` n'est pas activé.
- `/admin` est en `noindex`.
- `/admin` est bloqué dans `robots.txt`.
- La vraie autorisation dépend des droits GitHub sur le repo.

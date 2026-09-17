# Diagnostic recherche Firecrawl — 17 septembre 2026

## Constats vérifiés

- Version locale de départ : `f610794` (« Fix Google Flash Lite chat payload »), après `0300370` (« Use Google as primary chat provider »).
- Les quatre dernières recherches de lieux du 17 septembre, consultées en lecture seule dans Supabase, sont enregistrées en `no_results`. Elles ont donc été déclenchées, mais n'ont pas produit de fiches.
- Avec le modèle configuré `gemini-flash-lite-latest`, la vraie fonction de routage classe une demande explicite de photographe en `search_request` (1,2 s), et une question de méthode en `advice` (1,3 s). Le changement de fournisseur du chat n'est pas en lui-même une cause démontrée de non-déclenchement.
- Deux appels directs au modèle d'extraction Mistral ont retourné HTTP 429, `Rate limit exceeded`. L'extraction des pages Firecrawl utilisait exclusivement ce fournisseur et masquait ces erreurs en renvoyant `null`.
- Avant correction, une recherche Firecrawl de photographes à Paris a produit zéro fiche en 16,9 s, avec plusieurs annuaires/réseaux sociaux rejetés et un `SCRAPE_TIMEOUT`.
- Les anciennes limites de 26 s / 22 s renvoyaient un tableau vide dès l'échéance, même si certaines pages étaient déjà exploitables ; les opérations sous-jacentes continuaient. La normalisation pouvait ensuite attendre 45 s, hors d'une limite serveur de 60 s.

Les clés locales n'ont pas pu être comparées aux secrets Vercel : l'intégration Vercel renvoie HTTP 403 pour l'équipe propriétaire du projet. Le diagnostic ne prétend donc pas identifier toutes les erreurs propres au déploiement.

## Corrections

- Extraction JSON des pages via Google en priorité, Mistral en secours. Les erreurs HTTP, réponses tronquées et expirations sont journalisées sans clés API. Temporisation d'un fournisseur indisponible pour éviter de répéter immédiatement les 429.
- Budget interne par passe (30 s strict / 25 s élargi), conservation des fiches déjà vérifiées, annulation des extractions en cours/en attente et interdiction de lancer une extraction après l'échéance. Les requêtes SDK de scraping déjà parties peuvent finir sous leur propre timeout ; elles ne déclenchent plus de traitement ultérieur.
- Transport Firecrawl borné à une tentative par clé, rotation des clés conservée. Le SDK installé interprète `maxRetries` comme un nombre de tentatives : la valeur doit être 1, et non 0.
- Réduction des annuaires/réseaux sociaux dans la requête, déduplication par domaine avant scraping, vérification explicite du type de page. Le mode élargi retire les contraintes facultatives de la requête tout en conservant la catégorie et le lieu.
- Normalisation Mistral optionnelle limitée à 7 s ; les données déjà extraites et vérifiées permettent une fiche de repli.
- `maxDuration = 120` déclaré directement sur les deux routes de chat.
- Une seule clé IA suffit ; les accès Supabase ne dépendent plus d'une clé Mistral.
- Les confirmations courtes en mode dégradé conservent la catégorie et la zone de la recherche en attente.
- Annonce finale déterministe : nombre réel de fiches, consultation, tarifs/disponibilités à confirmer. Le test réel avait révélé une promesse infondée de respect du budget global du mariage.

## Validation

- 41 tests de routage existants.
- 49 tests anti-annuaires existants.
- 13 nouveaux tests de recherche : Google avec Mistral indisponible, secours Mistral, JSON tronqué, annuaires, doublons, zone incompatible, page non vérifiée, absence de prestation mariage, échéance et résultats partiels, recherche élargie, conservation du brief, configuration avec un fournisseur et POST complet jusqu'à l'API d'affichage.
- Contrôle TypeScript et compilation Next.js de production.
- API réelles avec authentification et base en mémoire : POST chat → décision → Firecrawl → extraction → normalisation → sauvegarde simulée → annonce et lien. Aucune conversation ni fiche utilisateur n'a été créée ou modifiée en production.
- Premier passage complet : 3 lieux autour de Lyon en 17,8 s et 3 photographes à Paris en 19,7 s. Un nouveau passage après durcissement des filtres a fourni 2 lieux en 17,7 s et 2 photographes en 21,5 s, avec le message final corrigé. Le nombre de résultats et la latence peuvent varier selon les sources et les fournisseurs ; jusqu'à 3 fiches sont affichées, sans inventer des informations absentes.

Exemples de sites officiels effectivement obtenus : [Domaine de la Noiseraie](https://www.domainedelanoiseraie.com/), [Le Domaine des Sources](https://ledomainedessources.com/), [The Parisian Photographers](https://theparisianphotographers.com/), [The Paris Photographer](https://www.theparisphotographer.com/). Les prix et disponibilités ne sont pas garantis par ces vérifications.

## Reproduire

```sh
npm run typecheck
npm run test:intent
npm run test:directory
npm run test:search
npm run build

# Appels réels, crédits API consommés, base isolée en mémoire :
npm run eval:search
node scripts/diagnose-search.mjs --providers
node scripts/diagnose-search.mjs --firecrawl
```

Le lanceur npm utilisateur de cette machine pointe vers un `npm-cli.js` absent. Les contrôles ont été exécutés directement avec `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/next/dist/bin/next build` et les scripts Node correspondants.

## Accès au déploiement lors du diagnostic

Le diagnostic initial et les tests ont été réalisés localement. L'intégration Vercel renvoyait HTTP 403 ; elle n'a donc pas permis de confirmer les secrets ni les logs du déploiement. La publication du correctif doit être suivie d'une vérification de la version et d'une recherche authentifiée sur le site déployé.

Références techniques : [API Search Firecrawl](https://docs.firecrawl.dev/api-reference/endpoint/search), [sorties JSON Gemini](https://ai.google.dev/gemini-api/docs/structured-output).

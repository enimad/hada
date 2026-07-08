# Chat V2 Hada — moteur LLM-first

## Principe

Le LLM est le décideur. À chaque tour, UN SEUL appel modèle (`buildHadaTurnPrompt`) produit à la fois :

1. la classification d'intention du dernier message ;
2. la réponse visible de Hada (`reply`).

Le serveur ne reclasse jamais la décision par regex. Il applique uniquement une **porte d'exécution** (`applyExecutionGate`, `lib/server/chat-v2/contracts.ts`) qui contrôle les actions coûteuses ou risquées.

## Architecture d'un tour

1. `ContextLoader` : la route (`app/api/chat-v2/route.ts`) charge l'utilisateur, le profil mariage, la conversation, les messages récents et les états en attente.
2. `Turn Decision` : appel unique au modèle (Mistral en JSON mode, Google optionnel en fallback via `HADA_AI_PROVIDER_ORDER`) avec : persona Hada + politique de routage + profil mariage + historique compacté (10 messages) + états serveur.
3. `Execution Gate` : le serveur vérifie que l'action décidée est légitime (voir plus bas), sans jamais reclasser advice/chat par regex.
4. `Tool Executor` : la route exécute seulement les actions validées : proposition de recherche, recherche prestataire, écriture profil confirmée.
5. `Response Composer` : la reply du LLM est utilisée telle quelle (sanitizée) pour advice/chat/deny/proposition ; les annonces de recherche et questions de clarification restent générées par un appel dédié.

## Intentions

- `advice` : conseil, méthode, critères, comparaison, explication, prix moyens.
- `chat` : discussion naturelle, émotions, inspiration générale.
- `search_request` : demande explicite de prestataires concrets, quelle que soit la formulation.
- `search_detail` : critère apporté pendant une collecte ouverte.
- `confirm` / `deny` : acceptation ou refus de la dernière proposition (recherche proposée, collecte en cours).
- `profile_update` : information durable du mariage à enregistrer (confirmation demandée avant écriture).
- `unclear` : message trop faible pour être routé.

## Politique de recherche : proposer + confirmer

- Demande explicite (« cherche-moi des traiteurs à Lyon », « il nous faut un DJ, tu peux t'en occuper ? ») → `search_request`, la collecte/recherche démarre directement.
- Besoin ambigu (« il nous faudrait un photographe ») → `propose_search: true` : Hada répond puis propose de lancer la recherche. L'état `chatV2PendingSearchProposal` est stocké dans `messages.metadata_json`.
- « oui / vas-y / ok lance » avec proposition en attente → `confirm` → la recherche démarre avec le brief de la proposition.
- Une proposition ignorée reste confirmable quelques tours (fenêtre de 12 messages) ; un `deny` la clôture.
- Type de prestataire non couvert par le catalogue (photobooth, pâtissier...) → réponse honnête listant les types couverts, jamais de recherche fantôme.

## Porte d'exécution (seuls contrôles serveur)

- message à très faible signal → `unclear` ;
- `confirm`/`deny` sans proposition ni collecte en attente → `chat` ;
- `search_detail` sans collecte ni proposition → `chat` ;
- catégorie non couverte → `advice` + réponse honnête ;
- `search_request` avec confiance < 0,55 → converti en proposition ;
- `profile_update` avec confiance < 0,55 → ignoré (discussion) ;
- une recherche ne s'exécute que pour `search_request`, `confirm` (avec état en attente) ou `search_detail` (avec collecte).

## Profil

Inchangé : le profil mariage est la source de vérité. Toute mise à jour passe par une confirmation explicite (`chatV2PendingProfileUpdate`, réponse oui/non), est appliquée champ par champ et journalisée dans `messages.metadata_json.chatV2ProfileChangeLog`.

## Fallback

- Le JSON invalide ou l'échec du fournisseur déclenche le fournisseur suivant, puis le **mode dégradé** : `heuristicClassificationV2` (regex élargies : « il nous faudrait », « on a besoin de », confirmations, refus, mises à jour profil chiffrées) + textes de secours statiques.
- Le fallback est invisible : mêmes états, mêmes contrats.
- `createChatV2FallbackResponse` couvre les erreurs serveur imprévues.

## Tests

- `npm run test:intent` : ~40 cas déterministes (`CHAT_V2_GUARD_TEST_CASES`) qui valident le mode dégradé + la porte d'exécution, sans appel réseau.
- `npm run eval:intent` : évaluation live du routeur réel contre l'API Mistral (`CHAT_V2_LLM_EVAL_CASES`, `scripts/eval-intent-live.mjs`). Cible : ≥ 90 % de précision sur les cas évalués. Attention au rate limit du compte Mistral (le script espace et rejoue les cas limités).

## Bugs prévenus par conception

- Recherche trop agressive : porte d'exécution + politique proposer/confirmer.
- Recherche jamais déclenchée malgré une demande claire (défaut historique des regex) : le LLM décide, plus de reclassement regex.
- Réponses sans mémoire : l'appel unique reçoit l'historique compacté.
- JSON modèle invalide : JSON mode + `parseHadaDecisionResponse` tolérant + fallback.
- Écrasement profil : impossible hors patch confirmé.
- Réponse annonçant une action non faite : les annonces de recherche ne sont rédigées qu'après exécution serveur.

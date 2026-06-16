# Chat V2 Hada

## Architecture

Le chat V2 est organisé autour d'un orchestrateur serveur. Les modèles ne décident jamais seuls des actions persistantes.

1. `ContextLoader` : la route charge l'utilisateur, le profil mariage, la conversation, les messages récents et les actions en attente.
2. `Decision Contract` : `lib/server/chat-v2/contracts.ts` définit un contrat JSON unique pour Google et Mistral.
3. `Model Router` : Google est utilisé pour l'analyse d'intention, Mistral sert de fallback technique. Une réponse JSON invalide déclenche le fallback.
4. `Decision Validator` : le serveur normalise les intentions, bloque les recherches non explicites et donne priorité au profil.
5. `Tool Executor` : la route exécute seulement les actions validées : proposition profil, écriture profil confirmée, recherche prestataire.
6. `Response Composer` : la réponse visible utilise le même prompt Hada quel que soit le fournisseur.

## Contrat De Sortie

Le modèle doit retourner uniquement un JSON avec :

- `intents`
- `needs_clarification`
- `clarification_question`
- `tool_calls`
- `user_reply`
- `profile_updates`
- `search_query`
- `safety_flags`
- `memory_notes`

Le serveur convertit ensuite ce contrat vers l'ancien format interne `IntentClassification` pour préserver la compatibilité avec l'UI actuelle.

## Profil

Le profil mariage reste la source de vérité persistante. Une mise à jour est appliquée uniquement après confirmation utilisateur.

Le serveur :

- applique uniquement les champs présents dans le patch ;
- n'écrase pas les autres champs ;
- demande confirmation en cas de nouvelle information ou de contradiction ;
- journalise la modification dans `messages.metadata_json.chatV2ProfileChangeLog`.

## Recherche

Une recherche prestataire part uniquement si l'intention est explicite ou si une collecte de recherche déjà ouverte reçoit un détail utile.

Exemples qui ne déclenchent pas de recherche :

- `c'est quoi un photobooth ?`
- `tu me conseilles quoi pour choisir un traiteur ?`
- `combien coûte un photographe ?`

Exemples qui déclenchent une recherche :

- `cherche-moi des traiteurs italiens à Marseille`
- `trouve des lieux avec étang autour de Paris`
- `liste-moi des photographes disponibles en Bretagne`

## Fallback

Le fallback est invisible pour l'utilisateur :

- si le fournisseur primaire échoue techniquement ;
- si le JSON est invalide ;
- si la réponse Google est interrompue ;
- si une erreur 429 survient après retry.

Le fournisseur secondaire reçoit le même prompt, le même contrat et les mêmes contraintes de ton.

## Cas Limites

Les cas limites principaux sont déclarés dans `CHAT_V2_GUARD_TEST_CASES` :

- message très court ;
- conseil prestataire sans recherche ;
- recherche explicite ;
- détail naturel pendant collecte ;
- question de compréhension prestataire.

## Bugs Probables À Prévenir

- Recherche trop agressive : bloquée par `isVendorAdviceDiscussion` et `hasExplicitSearchIntent`.
- JSON modèle invalide : bloqué par `parseHadaDecisionResponse` puis fallback.
- Ecrasement profil : impossible hors patch confirmé.
- Contradiction profil/recherche : le profil passe avant la recherche.
- Fallback visible : même prompt visible et même contrat pour tous les modèles.
- Réponse outil non exécuté : Hada ne confirme une action qu'après exécution serveur.

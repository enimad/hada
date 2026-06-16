# Conversation Flows

Ce document decrit les flux conversationnels actuellement supportes par Hada.

## 1. Entree Dans Le Chat

1. L'utilisateur se connecte.
2. `/auth/continue` verifie la session Supabase.
3. Si aucun profil mariage n'existe, l'utilisateur va sur `/onboarding`.
4. Sinon, il arrive sur `/chat`.
5. `GET /api/chat` cree une conversation active si besoin.
6. Hada affiche un recap court du profil mariage.

## 2. Conseil Sans Recherche

Exemple:

> Comment choisir entre un domaine et une salle de reception ?

Hada repond en conseil, sans lancer de recherche prestataire.

Objectif:

- eviter de consommer une recherche quand l'intention est seulement informative
- garder la conversation utile et contextualisee

## 3. Recherche Prestataire

Exemple:

> Je cherche un lieu pour 120 invites en Provence.

Hada verifie:

- categorie prestataire
- zone
- nombre d'invites
- budget si utile, surtout pour les lieux
- style ou contraintes si exprimes

Si l'information est insuffisante, Hada pose une question courte. Si l'information est suffisante, elle lance la recherche.

La recherche produit jusqu'a 3 candidats exploitables pour la beta. Les resultats sont stockes puis consultables dans `/vendors` ou `/venues`.

## 4. Mise A Jour Du Profil Depuis Le Chat

Si l'utilisateur donne une information qui modifie le profil, Hada peut:

- appliquer directement une mise a jour explicite
- demander confirmation si l'information contredit le profil existant

Exemple:

> Finalement on sera 150.

Hada demande confirmation avant de remplacer le nombre d'invites si le profil disait autre chose.

## 5. Recherche Sans Resultat

Si Firecrawl et les filtres de qualite ne produisent aucun candidat:

1. Hada explique que la recherche n'a pas donne de resultat fiable.
2. Elle propose une relance avec criteres elargis.
3. Si la relance echoue encore, elle donne un lien de recherche Google externe.

Le chat garde la trace de ces etapes dans les messages et metadonnees.

## 6. Contact Prestataire

Depuis une fiche prestataire:

1. Hada prepare un brouillon d'email.
2. L'utilisateur clique pour ouvrir son client mail.
3. L'app journalise le brouillon dans Supabase.
4. Hada ajoute une trace dans la conversation.

L'envoi automatique serveur n'est pas encore actif.

## 7. Survey Apres Fiche

Quand l'utilisateur quitte une fiche prestataire, Hada ouvre un survey si aucun survey n'a deja ete complete dans la session.

Le survey collecte:

- recommandation de Hada
- ce qui a plu
- ce qui a frustre
- intention de reutilisation
- feature souhaitee
- sensibilite prix
- modele de paiement prefere

Les reponses sont stockees dans `survey_responses`.

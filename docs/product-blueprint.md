# Product Blueprint

## Positionnement

Hada doit agir comme un wedding planner numerique proactif, pas comme un simple chatbot. Elle doit:

- comprendre le contexte du mariage
- guider l'utilisateur dans ses choix
- recommander des prestataires pertinents
- executer des actions concretes
- suivre les echanges et les prochaines etapes

## Personas MVP

### Couple autonome

- veut gagner du temps
- ne sait pas quels prestataires prioriser
- a besoin d'un cadre

### Couple a distance

- organise un mariage dans une autre ville ou un autre pays
- a besoin d'aide sur la recherche et les prises de contact

### Couple premium

- recherche des recommandations plus qualitatives et un haut niveau de personnalisation

## Donnees essentielles a collecter a l'inscription

- prenoms des maries
- email principal
- telephone facultatif
- date du mariage ou periode cible
- ville / region / pays
- nombre d'invites estime
- budget global ou fourchette
- style souhaite
- contraintes fortes
- type de ceremonie
- langue preferee

## Types de prestataires MVP

- lieu
- photographe
- traiteur
- DJ / groupe
- wedding planner humain
- fleuriste

Commencer par `lieu` est le meilleur choix pour un premier cas d'usage car:

- c'est structurant pour tout le reste
- les criteres sont assez clairs
- la valeur percue est immediate

## User story coeur

En tant que futur marie,
je veux expliquer mon projet de mariage a une IA,
afin qu'elle trouve pour moi des prestataires adaptes et les contacte si je le souhaite.

## Critere de succes du MVP

- onboarding complete > 60%
- au moins une recherche prestataire lancee par utilisateur actif
- temps moyen pour obtenir 5 recommandations < 2 minutes
- taux de clic ou d'interet sur au moins un prestataire > 30%
- au moins un contact lance avec consentement explicite

## Risques produit

- recommandations trop generiques
- manque de confiance dans les messages automatiques envoyes
- donnees de recherche web trop pauvres ou non fiables
- sur-promesse si l'IA se presente comme autonome sans garde-fous

## Garde-fous UX

- toujours rappeler le contexte mariage avant la recommendation
- afficher pourquoi chaque prestataire est recommande
- demander validation avant contact
- montrer le message qui sera envoye
- conserver un historique des demandes et reponses

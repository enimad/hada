# Conversation Flows

## Flux 1: onboarding puis chat

1. L'utilisateur cree son compte.
2. L'app collecte les informations mariage essentielles.
3. L'utilisateur arrive dans le chat.
4. L'IA affiche un recapitulatif court:
   "Vous preparez un mariage de 120 invites a Aix-en-Provence pour juin 2027 avec un style elegant et un budget estime entre 25k et 35k."
5. L'IA demande:
   "Quel prestataire voulez-vous trouver en premier ?"

## Flux 2: recherche de lieu

### Exemple de logique

Utilisateur:
"Je cherche un lieu."

IA:
"Bien sur. J'ai deja votre zone, votre budget et votre nombre d'invites. Il me manque encore 3 points pour lancer une recherche pertinente:

- voulez-vous un lieu interieur, exterieur ou mixte ?
- souhaitez-vous pouvoir faire la ceremonie sur place ?
- voulez-vous un hebergement sur place ?"

Quand l'IA a assez d'informations:

1. elle reformule les criteres
2. elle demande confirmation si un point est ambigu
3. elle lance la recherche
4. elle retourne 5 suggestions avec:
   - nom
   - localisation
   - pourquoi ce lieu correspond
   - gamme tarifaire si connue
   - lien

## Flux 3: prise de contact

Utilisateur:
"Contacte les 2 premiers pour un devis."

IA:

1. resume ce qu'elle va envoyer
2. montre le brouillon du message
3. demande validation explicite
4. envoie apres validation
5. met a jour le statut dans le chat

## Structure de reponse recommandee dans le chat

### Recap contexte

- date / periode
- lieu
- invites
- budget
- style

### Questions manquantes

- uniquement les champs non renseignes
- maximum 3 questions a la fois

### Resultats

- top 5 ordonne
- justification personnalisee
- next step propose

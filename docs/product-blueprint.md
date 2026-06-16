# Product Blueprint

## Positionnement

Hada est un wedding planner IA de poche. Elle doit aider un couple a avancer concretement, pas seulement discuter.

Elle doit:

- comprendre le contexte du mariage
- guider les decisions
- rechercher des prestataires pertinents
- expliquer pourquoi une recommandation est utile
- preparer les prises de contact
- garder une trace du profil, des recherches et des contacts

## Public Beta

### Couple autonome

- veut gagner du temps
- ne sait pas par quoi commencer
- veut un cadre simple et rassurant

### Couple a distance

- organise dans une autre ville ou region
- a besoin d'aide pour trouver et filtrer les prestataires

### Couple premium potentiel

- recherche des recommandations plus qualitatives
- peut payer si Hada fait gagner du temps ou reduit l'incertitude

## Parcours Actuel

1. L'utilisateur arrive sur la page publique.
2. Il s'inscrit par email ou via Google.
3. Il confirme son email si inscription password.
4. Il complete l'onboarding mariage.
5. Il arrive dans le chat Hada.
6. Il demande un conseil ou une recherche prestataire.
7. Hada enregistre les candidats dans la selection.
8. L'utilisateur consulte une fiche.
9. Il prepare un email de contact.
10. Hada collecte un retour survey apres la fiche.

## Donnees Collectees Aujourd'hui

- prenoms des deux maries
- date ou absence de date fixe
- lieux ou zones envisagees
- nombre d'invites ou absence de liste precise
- budget maximum ou absence de budget defini

Le chat peut ensuite enrichir:

- date
- ville ou region
- nombre d'invites
- budget minimum ou maximum

## Categories Prestataires

Categories codees:

- lieux
- traiteurs
- photographes
- videastes
- DJ
- musiciens
- decoration
- robes
- costumes
- fleuristes
- transport

Les lieux restent le cas d'usage le plus important pour la beta, car ils structurent le reste du mariage.

## Critere De Succes Beta

- onboarding complete sans friction majeure
- au moins une recherche prestataire lancee par utilisateur actif
- 1 a 3 recommandations exploitables par recherche
- ouverture d'au moins une fiche prestataire
- au moins un brouillon de contact prepare
- survey complete par une partie des utilisateurs

## Risques Produit

- resultats web trop pauvres ou trop generiques
- photos manquantes sur les lieux
- confiance insuffisante dans les donnees prestataires
- confusion entre contact assiste et envoi automatique
- quota recherche frustrant si mal explique
- cout Mistral/Firecrawl si les recherches ne sont pas controlees

## Garde-Fous UX

- demander une validation avant toute modification importante du profil
- ne pas pretendre avoir contacte un prestataire automatiquement
- montrer les informations manquantes ou incertaines
- privilegier les fiches riches et filtrer les resultats generiques
- proposer un fallback externe quand Hada ne trouve pas assez de donnees
- recueillir le feedback utilisateur apres consultation des fiches

## Monétisation A Explorer

Le survey teste trois familles:

- abonnement mensuel
- paiement unique jusqu'au jour J
- systeme de credits pour fonctionnalites premium

Les reponses pricing sont stockees dans `survey_responses.context_json.surveyAnswers`.

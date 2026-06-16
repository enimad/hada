# Roadmap

## Termine

- stack Next.js, TypeScript, Tailwind
- Supabase Auth email/password
- confirmation email
- Google OAuth
- schema Supabase metier
- onboarding mariage
- page profil mariage editable
- chat persistant
- integration Mistral pour le planner
- detection conseil vs recherche
- mise a jour du profil depuis le chat
- recherche prestataire Firecrawl
- rotation de cles Firecrawl
- fallback catalogue local
- normalisation des fiches prestataires via Mistral
- pages `/vendors`, `/venues` et fiches detail
- brouillon de contact email via `mailto:`
- journalisation des contacts
- popup survey produit et pricing
- redirection domaine canonique vers `hadawedding.fr`

## A Court Terme

1. Tester le parcours complet en production:
   - auth
   - onboarding
   - chat
   - recherche lieu
   - fiche lieu
   - contact
   - survey
2. Verifier que le schema Supabase prod contient `survey_responses`.
3. Configurer ou confirmer Firecrawl en prod.
4. Configurer Resend si les notifications survey sont necessaires.
5. Ajouter une configuration ESLint moderne si on veut restaurer `npm run lint`.
6. Durcir les messages d'erreur utilisateur sur recherche sans resultat ou quota atteint.

## Priorites Produit

- ameliorer la qualite des fiches lieux, surtout photos, adresse, capacite et contact
- clarifier le quota beta dans l'interface
- rendre les categories non-lieux aussi convaincantes que les lieux
- mieux expliquer les donnees incertaines dans les fiches
- analyser les reponses pricing et feature revee

## Priorites Tech

- ajouter des policies RLS basees sur `auth.uid()`
- reduire l'usage de la service role key dans les routes serveur
- ajouter des tests de routes critiques
- ajouter une suite smoke test du parcours beta
- isoler davantage la logique volumineuse de `app/api/chat/route.ts`
- suivre cout et latence Mistral/Firecrawl

## Plus Tard

- envoi email serveur vers les prestataires
- suivi des reponses prestataires
- relances automatiques
- disponibilites et statuts par prestataire
- tableau de bord de planning mariage
- analytics produit
- systeme premium selon les enseignements du survey

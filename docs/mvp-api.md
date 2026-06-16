# API Actuelle

Toutes les routes privees attendent un header:

```http
Authorization: Bearer <supabase_access_token>
```

La session est obtenue cote client avec `createSupabaseBrowserClient().auth.getSession()`.

## Auth

### `POST /api/auth/check-email`

Verifie si un compte Supabase existe deja pour un email.

Payload:

```json
{ "email": "couple@example.com" }
```

Reponse:

```json
{ "exists": true }
```

### `POST /api/auth/signup`

Cree un compte email/password et demande la confirmation email.

Payload:

```json
{ "email": "couple@example.com", "password": "secret123" }
```

Reponse:

```json
{ "ok": true, "requiresEmailConfirmation": true }
```

La connexion password et Google OAuth utilisent directement Supabase cote client.

### `POST /api/auth/logout`

Supprime les cookies Supabase connus cote serveur.

## Profil Mariage

### `GET /api/profile`

Retourne le profil mariage de l'utilisateur connecte.

### `PUT /api/profile`

Cree ou met a jour le profil mariage.

Payload attendu:

```json
{
  "partner_one_name": "Lea",
  "partner_two_name": "Hugo",
  "wedding_date": "2027-06-19",
  "wedding_period_text": null,
  "city": "Aix-en-Provence",
  "region": null,
  "country": "France",
  "guest_count": 120,
  "budget_min": null,
  "budget_max": 35000,
  "style": null,
  "ceremony_type": null,
  "notes": null
}
```

## Chat

### `GET /api/chat`

Charge ou cree la conversation active, initialise les premiers messages Hada si besoin, puis retourne:

```json
{
  "conversationId": "uuid",
  "messages": [],
  "profile": {}
}
```

### `POST /api/chat`

Envoie un message utilisateur a Hada.

Payload standard:

```json
{ "content": "Je cherche un lieu pour 120 invites en Provence." }
```

Payload pour relancer une recherche elargie:

```json
{ "action": "retry_search" }
```

La route peut:

- repondre en conseil simple
- demander une precision
- proposer une mise a jour du profil
- appliquer une mise a jour de profil confirmee
- lancer une recherche prestataire
- renvoyer un CTA vers `/vendors`
- renvoyer un lien Google externe si aucun resultat exploitable n'est trouve

## Prestataires

### `GET /api/vendors`

Liste les prestataires de l'utilisateur connecte.

Query params:

- `category`: optionnel, par exemple `venue`, `caterer`, `photographer`
- `slug`: optionnel, pour recuperer une fiche precise

Reponse:

```json
{
  "categories": [
    { "key": "venue", "label": "Lieux", "count": 3 }
  ],
  "candidates": []
}
```

### `POST /api/vendors/contact`

Prepare un brouillon email pour un prestataire.

Payload:

```json
{
  "candidateId": "uuid",
  "preview": true
}
```

Avec `preview: true`, la route retourne seulement `mailtoUrl` et `emailDraft`.

Sans `preview`, elle cree aussi un `outreach_thread`, un `outreach_message` et ajoute un message dans la conversation.

## Survey

### `POST /api/survey`

Enregistre le retour utilisateur apres consultation d'une fiche prestataire.

Champs obligatoires:

- `rating`
- `appreciated`
- `frustrated`
- `reuseIntent`
- `dreamFeature`
- `tooExpensivePrice`
- `expensiveButAcceptablePrice`
- `goodDealPrice`
- `tooCheapPrice`
- `pricingModels`

La route stocke le contexte complet dans `survey_responses.context_json` et tente d'envoyer un email via Resend si les variables sont configurees.

## Routes Auth Callback

### `GET /auth/callback`

Echange le code OAuth Supabase, puis redirige vers `/auth/continue`.

### `/auth/continue`

Page client qui determine la prochaine destination:

- `/onboarding` si aucun profil mariage n'existe
- `/chat` si le profil existe deja

# MVP API

## Auth

### `POST /api/auth/signup`

Creer un compte utilisateur.

### `POST /api/auth/login`

Ouvrir une session.

## Wedding profile

### `GET /api/wedding-profile`

Recuperer le profil mariage courant.

### `PUT /api/wedding-profile`

Mettre a jour le profil mariage.

Payload exemple:

```json
{
  "partnerOneName": "Lea",
  "partnerTwoName": "Hugo",
  "weddingDate": "2027-06-19",
  "city": "Aix-en-Provence",
  "guestCount": 120,
  "budgetMin": 25000,
  "budgetMax": 35000,
  "style": "Elegant provençal"
}
```

## Chat

### `GET /api/conversations/current`

Retourner ou creer la conversation active.

### `GET /api/conversations/:id/messages`

Retourner l'historique.

### `POST /api/chat/message`

Envoyer un message utilisateur au planner IA.

Payload exemple:

```json
{
  "conversationId": "conv_123",
  "message": "Je cherche un lieu pour notre mariage."
}
```

Reponse exemple:

```json
{
  "assistantMessage": "J'ai deja votre budget et votre nombre d'invites. Il me manque le type d'espace, la ceremonie sur place et l'hebergement.",
  "toolActions": [],
  "conversationState": {
    "activeVendorCategory": "venue",
    "missingFields": ["spaceType", "ceremonyOnSite", "lodgingNeeded"]
  }
}
```

## Vendor search

### `POST /api/vendor-requests`

Creer ou mettre a jour une demande prestataire.

### `POST /api/vendor-requests/:id/search`

Lancer la recherche.

Reponse exemple:

```json
{
  "requestId": "vr_123",
  "status": "completed",
  "candidates": [
    {
      "name": "Domaine des Oliviers",
      "city": "Aix-en-Provence",
      "score": 92,
      "summary": "Correspond au style elegant, accepte 120 invites et propose hebergement.",
      "sourceUrl": "https://example.com"
    }
  ]
}
```

## Outreach

### `POST /api/outreach/draft`

Generer un brouillon de message avant validation.

### `POST /api/outreach/send`

Envoyer le message apres consentement.

Payload exemple:

```json
{
  "vendorCandidateId": "vc_123",
  "channel": "email",
  "subject": "Demande de devis pour mariage en juin 2027",
  "message": "Bonjour, nous recherchons un lieu pour 120 invites a Aix-en-Provence..."
}
```

### `GET /api/outreach/threads`

Lister les fils de contact et leurs statuts.

## Webhooks

### `POST /api/webhooks/email/inbound`

Recevoir les reponses des prestataires.

### `POST /api/webhooks/email/status`

Recevoir les statuts d'envoi.

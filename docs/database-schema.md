# Database Schema

Le schema SQL de reference est [supabase/schema.sql](../supabase/schema.sql). Ce document resume les tables actuellement utilisees par Hada.

## Auth

### `auth.users`

Source de verite Supabase Auth pour les comptes utilisateurs. Les tables metier referencent `auth.users(id)`.

## Profil Mariage

### `public.wedding_profiles`

Profil mariage unique par utilisateur.

- `id`
- `user_id`
- `partner_one_name`
- `partner_two_name`
- `wedding_date`
- `wedding_period_text`
- `city`
- `region`
- `country`
- `guest_count`
- `budget_min`
- `budget_max`
- `style`
- `ceremony_type`
- `notes`
- `profile_completion_score`
- `created_at`
- `updated_at`

## Conversation

### `public.conversations`

Conversation active du couple avec Hada.

- `id`
- `user_id`
- `title`
- `status`
- `created_at`
- `updated_at`

### `public.messages`

Historique du chat. `metadata_json` porte les CTAs, etats de recherche en attente, confirmations de mise a jour profil, quota, etc.

- `id`
- `conversation_id`
- `role`: `user`, `assistant` ou `tool`
- `content`
- `tool_name`
- `metadata_json`
- `created_at`

## Prestataires

### `public.vendor_requests`

Une demande de recherche prestataire lancee depuis le chat.

- `id`
- `user_id`
- `conversation_id`
- `vendor_category`
- `status`: par exemple `searching`, `results_ready`, `no_results`, `cache_hit`
- `requirements_json`
- `search_query_text`
- `created_at`
- `updated_at`

`requirements_json` contient aussi le marqueur de quota beta.

### `public.vendor_candidates`

Prestataires trouves, normalises et affiches dans `/vendors`, `/venues` et les fiches detail.

- `id`
- `vendor_request_id`
- `name`
- `category`
- `website`
- `email`
- `phone`
- `city`
- `region`
- `price_range`
- `score`
- `summary`
- `source_url`
- `metadata_json`
- `created_at`

`metadata_json.vendor_profile` contient la fiche structuree produite par le normaliseur Mistral ou par le fallback local.

## Contact

### `public.outreach_threads`

Journalisation du brouillon de contact prepare par Hada.

- `id`
- `user_id`
- `vendor_candidate_id`
- `channel`
- `subject`
- `status`
- `last_message_at`
- `created_at`
- `updated_at`

### `public.outreach_messages`

Messages lies a un fil de contact. Aujourd'hui, l'app stocke le brouillon sortant et ouvre le client email de l'utilisateur via `mailto:`.

- `id`
- `outreach_thread_id`
- `direction`: `outbound` ou `inbound`
- `sender_label`
- `content`
- `external_message_id`
- `created_at`

## Survey

### `public.survey_responses`

Retour utilisateur collecte par le popup survey apres consultation d'une fiche prestataire.

- `id`
- `user_id`
- `source_path`
- `source_vendor_slug`
- `rating`
- `appreciated`
- `frustrated`
- `reuse_intent`
- `dream_feature`
- `context_json`
- `email_sent`
- `created_at`

Les reponses pricing sont stockees dans `context_json.surveyAnswers`.

## Triggers Et RLS

Les tables principales ont un trigger `updated_at` quand necessaire.

RLS est activee sur les tables metier. Les routes serveur valident le bearer token Supabase, puis utilisent la service role key. Les policies RLS basees sur `auth.uid()` restent a renforcer avant une exposition plus large.

# Database Schema MVP

## Entites principales

### auth.users

Source de verite recommandee pour l'authentification si vous utilisez Supabase Auth.

### wedding_profiles

- id
- user_id
- partner_one_name
- partner_two_name
- wedding_date
- wedding_period_text
- city
- region
- country
- guest_count
- budget_min
- budget_max
- style
- ceremony_type
- dietary_constraints
- accessibility_needs
- languages
- notes
- profile_completion_score
- created_at
- updated_at

### conversations

- id
- user_id
- title
- status
- created_at
- updated_at

### messages

- id
- conversation_id
- role
- content
- tool_name
- metadata_json
- created_at

### vendor_requests

- id
- user_id
- conversation_id
- vendor_category
- status
- requirements_json
- search_query_text
- created_at
- updated_at

### vendor_candidates

- id
- vendor_request_id
- name
- category
- website
- email
- phone
- city
- region
- price_range
- score
- summary
- source_url
- metadata_json
- created_at

### outreach_threads

- id
- user_id
- vendor_candidate_id
- channel
- subject
- status
- last_message_at
- created_at
- updated_at

### outreach_messages

- id
- outreach_thread_id
- direction
- sender_label
- content
- external_message_id
- created_at

## Donnees de qualification par type de prestataire

### lieu

- date ou periode
- zone geographique
- nombre d'invites
- budget
- style
- interieur / exterieur
- hebergement sur place
- ceremonie sur place
- accessibilite
- parking
- contraintes horaires

### photographe

- date
- lieu
- style photo
- couverture souhaitee
- budget
- livraison attendue

## Regles importantes

- les champs structures vont en colonnes
- les details variables vont en JSON
- toutes les actions IA importantes doivent etre tracables
- les candidats vendors doivent etre historises, meme si la recherche est relancee

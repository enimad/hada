create extension if not exists "pgcrypto";

create table if not exists public.wedding_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  partner_one_name text,
  partner_two_name text,
  wedding_date date,
  wedding_period_text text,
  city text,
  region text,
  country text,
  guest_count integer,
  budget_min integer,
  budget_max integer,
  style text,
  ceremony_type text,
  notes text,
  wedding_checklist jsonb not null default '[]'::jsonb,
  wedding_budget_overrides jsonb not null default '{}'::jsonb,
  profile_completion_score integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wedding_profiles
  add column if not exists wedding_checklist jsonb not null default '[]'::jsonb;

alter table public.wedding_profiles
  add column if not exists wedding_budget_overrides jsonb not null default '{}'::jsonb;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text not null,
  tool_name text,
  metadata_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.vendor_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  vendor_category text not null,
  status text not null default 'intake',
  requirements_json jsonb not null default '{}'::jsonb,
  search_query_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendor_candidates (
  id uuid primary key default gen_random_uuid(),
  vendor_request_id uuid not null references public.vendor_requests(id) on delete cascade,
  name text not null,
  category text not null,
  website text,
  email text,
  phone text,
  city text,
  region text,
  price_range text,
  score numeric(5,2),
  summary text,
  source_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.outreach_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_candidate_id uuid not null references public.vendor_candidates(id) on delete cascade,
  channel text not null default 'email',
  subject text,
  status text not null default 'draft',
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  outreach_thread_id uuid not null references public.outreach_threads(id) on delete cascade,
  direction text not null check (direction in ('outbound', 'inbound')),
  sender_label text,
  content text not null,
  external_message_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_path text,
  source_vendor_slug text,
  rating integer check (rating between 0 and 10),
  appreciated text,
  frustrated text,
  reuse_intent text,
  dream_feature text,
  context_json jsonb not null default '{}'::jsonb,
  email_sent boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.offer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  selected_plan text not null check (selected_plan in ('essential', 'serenity')),
  billing_mode text not null check (billing_mode in ('monthly', 'one_time')),
  source_path text not null default '/mon-offre',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_wedding_profiles_updated_at on public.wedding_profiles;
create trigger set_wedding_profiles_updated_at
before update on public.wedding_profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists set_conversations_updated_at on public.conversations;
create trigger set_conversations_updated_at
before update on public.conversations
for each row execute procedure public.set_updated_at();

drop trigger if exists set_vendor_requests_updated_at on public.vendor_requests;
create trigger set_vendor_requests_updated_at
before update on public.vendor_requests
for each row execute procedure public.set_updated_at();

drop trigger if exists set_outreach_threads_updated_at on public.outreach_threads;
create trigger set_outreach_threads_updated_at
before update on public.outreach_threads
for each row execute procedure public.set_updated_at();

drop trigger if exists set_offer_preferences_updated_at on public.offer_preferences;
create trigger set_offer_preferences_updated_at
before update on public.offer_preferences
for each row execute procedure public.set_updated_at();

alter table public.wedding_profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.vendor_requests enable row level security;
alter table public.vendor_candidates enable row level security;
alter table public.outreach_threads enable row level security;
alter table public.outreach_messages enable row level security;
alter table public.survey_responses enable row level security;
alter table public.offer_preferences enable row level security;

-- Supabase Data API grants.
-- The application currently reads/writes business tables only through server routes
-- using SUPABASE_SERVICE_ROLE_KEY, so we explicitly grant the service_role access
-- needed by supabase-js/PostgREST without exposing tables to anon/authenticated.
grant usage on schema public to service_role;

grant select, insert, update, delete on public.wedding_profiles to service_role;
grant select, insert, update, delete on public.conversations to service_role;
grant select, insert, update, delete on public.messages to service_role;
grant select, insert, update, delete on public.vendor_requests to service_role;
grant select, insert, update, delete on public.vendor_candidates to service_role;
grant select, insert, update, delete on public.outreach_threads to service_role;
grant select, insert, update, delete on public.outreach_messages to service_role;
grant select, insert, update, delete on public.survey_responses to service_role;
grant select, insert, update, delete on public.offer_preferences to service_role;

-- Keep anon/authenticated blocked from direct table access for now.
-- If the frontend starts querying tables directly with supabase-js, add explicit
-- grants plus RLS policies based on auth.uid() for each exposed table.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.offer_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  selected_plan text not null check (selected_plan in ('essential', 'serenity')),
  billing_mode text not null check (billing_mode in ('monthly', 'one_time')),
  source_path text not null default '/mon-offre',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists set_offer_preferences_updated_at on public.offer_preferences;
create trigger set_offer_preferences_updated_at
before update on public.offer_preferences
for each row execute procedure public.set_updated_at();

alter table public.offer_preferences enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on public.offer_preferences to service_role;

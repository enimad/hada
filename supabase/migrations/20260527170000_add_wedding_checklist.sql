alter table public.wedding_profiles
  add column if not exists wedding_checklist jsonb not null default '[]'::jsonb;

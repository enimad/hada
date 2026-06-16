alter table public.wedding_profiles
  add column if not exists wedding_budget_overrides jsonb not null default '{}'::jsonb;

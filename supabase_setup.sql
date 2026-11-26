-- Run this once in your Supabase SQL Editor
create table if not exists public.pa_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pa_state enable row level security;

-- Personal single-user policy (since you use your own private project)
create policy "Allow all access to pa_state"
  on public.pa_state
  for all
  to anon, authenticated
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant all on table public.pa_state to anon, authenticated;


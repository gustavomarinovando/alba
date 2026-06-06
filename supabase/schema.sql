create table if not exists public.cycle_entries (
  couple_id integer not null,
  date text not null,
  entry jsonb not null,
  updated_at timestamptz not null,
  primary key (couple_id, date)
);

-- Required so Realtime DELETE events include the composite primary key.
alter table public.cycle_entries replica identity full;

-- Realtime must also be enabled for this table in the Supabase publication.
do $$
begin
  alter publication supabase_realtime add table public.cycle_entries;
exception
  when duplicate_object then null;
end $$;

alter table public.cycle_entries enable row level security;

-- MVP policy for a private shared app using the anon key.
-- Tighten this once Supabase Auth/user accounts are added.
create policy "cycle_entries_shared_read"
on public.cycle_entries
for select
using (couple_id = 1);

create policy "cycle_entries_shared_insert"
on public.cycle_entries
for insert
with check (couple_id = 1);

create policy "cycle_entries_shared_update"
on public.cycle_entries
for update
using (couple_id = 1)
with check (couple_id = 1);

create policy "cycle_entries_shared_delete"
on public.cycle_entries
for delete
using (couple_id = 1);

create table if not exists public.push_subscriptions (
  couple_id integer not null,
  endpoint text not null,
  subscription jsonb not null,
  enabled boolean not null default true,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (couple_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- MVP policy matching the shared couple_id = 1 model.
-- Replace with Supabase Auth ownership checks before opening Alba beyond personal use.
create policy "push_subscriptions_shared_read"
on public.push_subscriptions
for select
using (couple_id = 1);

create policy "push_subscriptions_shared_insert"
on public.push_subscriptions
for insert
with check (couple_id = 1);

create policy "push_subscriptions_shared_update"
on public.push_subscriptions
for update
using (couple_id = 1)
with check (couple_id = 1);

create policy "push_subscriptions_shared_delete"
on public.push_subscriptions
for delete
using (couple_id = 1);

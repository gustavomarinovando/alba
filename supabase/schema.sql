create table if not exists public.cycle_entries (
  couple_id integer not null,
  date text not null,
  entry jsonb not null,
  updated_at timestamptz not null,
  primary key (couple_id, date)
);

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

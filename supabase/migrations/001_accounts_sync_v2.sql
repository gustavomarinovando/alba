-- Alba accounts/sync v2: additive schema only.
-- Safe to run while the current app continues using public.cycle_entries (couple_id = 1).
-- This file does not copy, update, or delete any legacy cycle data.

begin;

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'member')),
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id)
);

create table if not exists public.couple_invites (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check ((used_at is null and used_by is null) or (used_at is not null and used_by is not null))
);

create table if not exists public.cycle_subjects (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  can_self_record boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (couple_id, id)
);

create table if not exists public.cycle_entries_v2 (
  couple_id uuid not null,
  subject_id uuid not null,
  date date not null,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  review_state text not null default 'accepted' check (review_state in ('accepted', 'pending', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  entry jsonb not null check (jsonb_typeof(entry) = 'object'),
  revision uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_id, date),
  foreign key (couple_id, subject_id) references public.cycle_subjects(couple_id, id) on delete cascade,
  check ((review_state = 'pending' and reviewed_by is null) or review_state <> 'pending')
);

create table if not exists public.push_subscriptions_v2 (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null check (jsonb_typeof(subscription) = 'object'),
  enabled boolean not null default true,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);

create table if not exists public.migration_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null unique,
  target_couple_id uuid not null references public.couples(id) on delete restrict,
  target_subject_id uuid not null,
  status text not null check (status in ('prepared', 'copied', 'verified', 'cutover', 'rolled_back')),
  source_count integer,
  destination_count integer,
  source_hash text,
  destination_hash text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (target_couple_id, target_subject_id) references public.cycle_subjects(couple_id, id) on delete restrict
);

create index if not exists couple_members_user_active_idx
  on public.couple_members(user_id, couple_id) where status = 'active';
create index if not exists cycle_subjects_couple_idx on public.cycle_subjects(couple_id);
create index if not exists cycle_entries_v2_couple_updated_idx on public.cycle_entries_v2(couple_id, updated_at);
create index if not exists push_subscriptions_v2_couple_idx on public.push_subscriptions_v2(couple_id) where enabled;

create or replace function private.is_active_couple_member(target_couple_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members
    where couple_id = target_couple_id
      and user_id = target_user_id
      and status = 'active'
  );
$$;

create or replace function private.is_couple_owner(target_couple_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couple_members
    where couple_id = target_couple_id
      and user_id = target_user_id
      and role = 'owner'
      and status = 'active'
  );
$$;

create or replace function private.is_couple_creator(target_couple_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.couples
    where id = target_couple_id
      and created_by = target_user_id
  );
$$;

revoke all on function private.is_active_couple_member(uuid, uuid) from public, anon;
revoke all on function private.is_couple_owner(uuid, uuid) from public, anon;
revoke all on function private.is_couple_creator(uuid, uuid) from public, anon;
grant execute on function private.is_active_couple_member(uuid, uuid) to authenticated;
grant execute on function private.is_couple_owner(uuid, uuid) to authenticated;
grant execute on function private.is_couple_creator(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.couple_invites enable row level security;
alter table public.cycle_subjects enable row level security;
alter table public.cycle_entries_v2 enable row level security;
alter table public.push_subscriptions_v2 enable row level security;
alter table public.migration_runs enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using (id = (select auth.uid()));
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
with check (id = (select auth.uid()));
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists "couples_select_member" on public.couples;
create policy "couples_select_member" on public.couples for select to authenticated
using ((select private.is_active_couple_member(id)));
drop policy if exists "couples_insert_creator" on public.couples;
create policy "couples_insert_creator" on public.couples for insert to authenticated
with check (created_by = (select auth.uid()));
drop policy if exists "couples_update_owner" on public.couples;
create policy "couples_update_owner" on public.couples for update to authenticated
using ((select private.is_couple_owner(id))) with check ((select private.is_couple_owner(id)));

drop policy if exists "couple_members_select_member" on public.couple_members;
create policy "couple_members_select_member" on public.couple_members for select to authenticated
using ((select private.is_active_couple_member(couple_id)));
drop policy if exists "couple_members_insert_creator_or_owner" on public.couple_members;
create policy "couple_members_insert_creator_or_owner" on public.couple_members for insert to authenticated
with check (
  (user_id = (select auth.uid()) and role = 'owner' and (select private.is_couple_creator(couple_id)))
  or (select private.is_couple_owner(couple_id))
);
drop policy if exists "couple_members_update_owner" on public.couple_members;
create policy "couple_members_update_owner" on public.couple_members for update to authenticated
using ((select private.is_couple_owner(couple_id))) with check ((select private.is_couple_owner(couple_id)));

drop policy if exists "cycle_subjects_select_member" on public.cycle_subjects;
create policy "cycle_subjects_select_member" on public.cycle_subjects for select to authenticated
using ((select private.is_active_couple_member(couple_id)));
drop policy if exists "cycle_subjects_insert_member" on public.cycle_subjects;
create policy "cycle_subjects_insert_member" on public.cycle_subjects for insert to authenticated
with check ((select private.is_active_couple_member(couple_id)));
drop policy if exists "cycle_subjects_update_member" on public.cycle_subjects;
create policy "cycle_subjects_update_member" on public.cycle_subjects for update to authenticated
using ((select private.is_active_couple_member(couple_id)))
with check ((select private.is_active_couple_member(couple_id)));

drop policy if exists "cycle_entries_v2_select_member" on public.cycle_entries_v2;
create policy "cycle_entries_v2_select_member" on public.cycle_entries_v2 for select to authenticated
using ((select private.is_active_couple_member(couple_id)));
drop policy if exists "cycle_entries_v2_insert_member" on public.cycle_entries_v2;
create policy "cycle_entries_v2_insert_member" on public.cycle_entries_v2 for insert to authenticated
with check ((select private.is_active_couple_member(couple_id)) and recorded_by = (select auth.uid()));
drop policy if exists "cycle_entries_v2_update_member" on public.cycle_entries_v2;
create policy "cycle_entries_v2_update_member" on public.cycle_entries_v2 for update to authenticated
using ((select private.is_active_couple_member(couple_id)) and recorded_by = (select auth.uid()))
with check ((select private.is_active_couple_member(couple_id)) and recorded_by = (select auth.uid()));
drop policy if exists "cycle_entries_v2_delete_member" on public.cycle_entries_v2;
create policy "cycle_entries_v2_delete_member" on public.cycle_entries_v2 for delete to authenticated
using ((select private.is_active_couple_member(couple_id)));

drop policy if exists "push_subscriptions_v2_select_own" on public.push_subscriptions_v2;
create policy "push_subscriptions_v2_select_own" on public.push_subscriptions_v2 for select to authenticated
using (user_id = (select auth.uid()) and (select private.is_active_couple_member(couple_id)));
drop policy if exists "push_subscriptions_v2_insert_own" on public.push_subscriptions_v2;
create policy "push_subscriptions_v2_insert_own" on public.push_subscriptions_v2 for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.is_active_couple_member(couple_id)));
drop policy if exists "push_subscriptions_v2_update_own" on public.push_subscriptions_v2;
create policy "push_subscriptions_v2_update_own" on public.push_subscriptions_v2 for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()) and (select private.is_active_couple_member(couple_id)));
drop policy if exists "push_subscriptions_v2_delete_own" on public.push_subscriptions_v2;
create policy "push_subscriptions_v2_delete_own" on public.push_subscriptions_v2 for delete to authenticated
using (user_id = (select auth.uid()));

-- Invites are deliberately not readable through the table API. A later RPC will
-- create and consume one-use tokens without exposing token hashes.

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.couples to authenticated;
grant select, insert, update on public.couple_members to authenticated;
grant select, insert, update on public.cycle_subjects to authenticated;
grant select, insert, update, delete on public.cycle_entries_v2 to authenticated;
grant select, insert, update, delete on public.push_subscriptions_v2 to authenticated;
revoke all on public.couple_invites from anon, authenticated;
revoke all on public.migration_runs from anon, authenticated;

alter table public.cycle_entries_v2 replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cycle_entries_v2'
  ) then
    alter publication supabase_realtime add table public.cycle_entries_v2;
  end if;
end $$;

commit;

-- Read-only verification. Safe to run repeatedly.

with target as (
  select target_couple_id, target_subject_id
  from public.migration_runs
  where source = 'legacy-couple-1'
), source_summary as (
  select
    count(*)::integer as row_count,
    min(date) as first_date,
    max(date) as last_date,
    md5(coalesce(string_agg(date || ':' || entry::text || ':' || updated_at::text, '|' order by date), '')) as content_hash
  from public.cycle_entries
  where couple_id = 1
), destination_summary as (
  select
    count(*)::integer as row_count,
    min(date)::text as first_date,
    max(date)::text as last_date,
    md5(coalesce(string_agg(date::text || ':' || entry::text || ':' || updated_at::text, '|' order by date), '')) as content_hash
  from public.cycle_entries_v2 e
  join target t on t.target_couple_id = e.couple_id and t.target_subject_id = e.subject_id
)
select
  s.row_count as legacy_rows,
  d.row_count as v2_rows,
  s.first_date as legacy_first_date,
  d.first_date as v2_first_date,
  s.last_date as legacy_last_date,
  d.last_date as v2_last_date,
  s.content_hash as legacy_hash,
  d.content_hash as v2_hash,
  (s.row_count = d.row_count and s.first_date = d.first_date and s.last_date = d.last_date and s.content_hash = d.content_hash) as verified
from source_summary s cross join destination_summary d;

-- Structural/RLS audit. migration_runs is intentionally service/admin-only.
select schemaname, tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'couples', 'couple_members', 'couple_invites', 'cycle_subjects', 'cycle_entries_v2', 'push_subscriptions_v2', 'migration_runs')
order by tablename;

select schemaname, tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'couples', 'couple_members', 'cycle_subjects', 'cycle_entries_v2', 'push_subscriptions_v2')
order by tablename, policyname;

select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime' and tablename = 'cycle_entries_v2';

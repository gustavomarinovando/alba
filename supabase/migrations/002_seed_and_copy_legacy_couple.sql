-- Run only after 001_accounts_sync_v2.sql and after creating the first Auth user.
-- Replace the two values marked REPLACE_ME. This script is transactional and
-- aborts without partial copy if the source/destination verification differs.

begin;

do $$
declare
  v_owner_email text := 'REPLACE_ME@example.com';
  v_display_name text := 'REPLACE_ME';
  v_owner_id uuid;
  v_existing_owner_id uuid;
  v_couple_id uuid;
  v_subject_id uuid;
  v_source_count integer;
  v_destination_count integer;
  v_source_hash text;
  v_destination_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('alba-legacy-couple-1-migration'));

  select id into v_owner_id
  from auth.users
  where lower(email) = lower(v_owner_email)
  order by created_at
  limit 1;

  if v_owner_id is null then
    raise exception 'No Auth user found for %. Create/confirm the user first.', v_owner_email;
  end if;

  insert into public.profiles (id, display_name)
  values (v_owner_id, v_display_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  select target_couple_id, target_subject_id, created_by
  into v_couple_id, v_subject_id, v_existing_owner_id
  from public.migration_runs
  where source = 'legacy-couple-1';

  if v_existing_owner_id is not null and v_existing_owner_id <> v_owner_id then
    raise exception 'Migration already belongs to Auth user %, not %', v_existing_owner_id, v_owner_id;
  end if;

  if v_couple_id is null then
    v_couple_id := gen_random_uuid();
    v_subject_id := gen_random_uuid();

    insert into public.couples (id, name, created_by)
    values (v_couple_id, 'Alba private migration', v_owner_id);

    insert into public.couple_members (couple_id, user_id, role, status)
    values (v_couple_id, v_owner_id, 'owner', 'active');

    insert into public.cycle_subjects (id, couple_id, profile_id, display_name, can_self_record)
    values (v_subject_id, v_couple_id, v_owner_id, v_display_name, true);

    insert into public.migration_runs (
      source, target_couple_id, target_subject_id, status, created_by
    ) values (
      'legacy-couple-1', v_couple_id, v_subject_id, 'prepared', v_owner_id
    );
  end if;

  select count(*), md5(coalesce(string_agg(date || ':' || entry::text || ':' || updated_at::text, '|' order by date), ''))
  into v_source_count, v_source_hash
  from public.cycle_entries
  where couple_id = 1;

  if v_source_count = 0 then
    raise exception 'Legacy couple_id = 1 has no rows. Stop and verify the project/table before migrating.';
  end if;

  insert into public.cycle_entries_v2 (
    couple_id, subject_id, date, recorded_by, review_state, entry, created_at, updated_at
  )
  select
    v_couple_id,
    v_subject_id,
    legacy.date::date,
    v_owner_id,
    'accepted',
    legacy.entry,
    coalesce(nullif(legacy.entry->>'createdAt', '')::timestamptz, legacy.updated_at),
    legacy.updated_at
  from public.cycle_entries legacy
  where legacy.couple_id = 1
  on conflict (subject_id, date) do nothing;

  select count(*), md5(coalesce(string_agg(date::text || ':' || entry::text || ':' || updated_at::text, '|' order by date), ''))
  into v_destination_count, v_destination_hash
  from public.cycle_entries_v2
  where couple_id = v_couple_id and subject_id = v_subject_id;

  if v_source_count <> v_destination_count or v_source_hash is distinct from v_destination_hash then
    raise exception 'Verification failed: source %/% destination %/%',
      v_source_count, v_source_hash, v_destination_count, v_destination_hash;
  end if;

  update public.migration_runs
  set status = 'verified',
      source_count = v_source_count,
      destination_count = v_destination_count,
      source_hash = v_source_hash,
      destination_hash = v_destination_hash,
      updated_at = now()
  where source = 'legacy-couple-1';
end $$;

commit;

-- The SQL Editor result pane should show one verified row after the transaction.
select source, status, target_couple_id, target_subject_id,
       source_count, destination_count, source_hash, destination_hash, updated_at
from public.migration_runs
where source = 'legacy-couple-1';

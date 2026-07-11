-- One-time authorization for Sarit to claim the already verified legacy dataset.
-- Additive and safe to run before she registers. Stores only an email hash.
begin;

create table if not exists private.legacy_claim_authorizations (
  source text primary key references public.migration_runs(source) on delete cascade,
  email_hash text not null,
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

insert into private.legacy_claim_authorizations (source, email_hash)
values ('legacy-couple-1', encode(digest(lower(trim('saritcarrillofuentes@gmail.com')), 'sha256'), 'hex'))
on conflict (source) do update
set email_hash = excluded.email_hash
where private.legacy_claim_authorizations.consumed_at is null;

create or replace function public.claim_legacy_cycle_dataset()
returns table (couple_id uuid, subject_id uuid, subject_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt()->>'email', '')));
  v_run public.migration_runs%rowtype;
  v_auth private.legacy_claim_authorizations%rowtype;
begin
  if v_user_id is null or v_email = '' then
    raise exception 'Authentication required';
  end if;

  select * into v_auth from private.legacy_claim_authorizations
  where source = 'legacy-couple-1' for update;
  if not found or v_auth.consumed_at is not null then
    raise exception 'Legacy claim is unavailable';
  end if;
  if encode(digest(v_email, 'sha256'), 'hex') <> v_auth.email_hash then
    raise exception 'This account is not authorized to claim the legacy dataset';
  end if;

  select * into v_run from public.migration_runs
  where source = 'legacy-couple-1' for update;
  if not found or v_run.status not in ('verified', 'cutover') then
    raise exception 'Legacy migration is not verified';
  end if;

  insert into public.profiles (id, display_name)
  values (v_user_id, split_part(v_email, '@', 1))
  on conflict (id) do nothing;

  update public.couples set created_by = v_user_id, updated_at = now()
  where id = v_run.target_couple_id;

  update public.couple_members set role = 'member'
  where couple_id = v_run.target_couple_id and role = 'owner';
  insert into public.couple_members (couple_id, user_id, role, status)
  values (v_run.target_couple_id, v_user_id, 'owner', 'active')
  on conflict (couple_id, user_id) do update set role = 'owner', status = 'active';

  update public.cycle_subjects set profile_id = v_user_id, updated_at = now()
  where id = v_run.target_subject_id;
  update public.cycle_entries_v2 set recorded_by = v_user_id
  where subject_id = v_run.target_subject_id;
  update public.migration_runs set created_by = v_user_id, updated_at = now()
  where source = 'legacy-couple-1';

  update private.legacy_claim_authorizations
  set consumed_at = now(), consumed_by = v_user_id
  where source = 'legacy-couple-1';

  return query select v_run.target_couple_id, v_run.target_subject_id,
    (select display_name from public.cycle_subjects where id = v_run.target_subject_id);
end;
$$;

revoke all on function public.claim_legacy_cycle_dataset() from public, anon;
grant execute on function public.claim_legacy_cycle_dataset() to authenticated;
commit;

-- Administrative finalization when email confirmation completed without the
-- client-side claim running. Transactional; legacy source rows are untouched.
begin;

do $$
declare
  v_sarit uuid;
  v_run public.migration_runs%rowtype;
begin
  select id into v_sarit from auth.users
  where lower(email) = 'saritcarrillofuentes@gmail.com'
  order by created_at desc limit 1;
  if v_sarit is null then raise exception 'Sarit Auth user does not exist'; end if;

  select * into v_run from public.migration_runs
  where source = 'legacy-couple-1' for update;
  if not found or v_run.source_count <> v_run.destination_count then
    raise exception 'Migration is missing or counts do not match';
  end if;
  if (select count(*) from public.cycle_entries_v2 where subject_id = v_run.target_subject_id) <> v_run.destination_count then
    raise exception 'Current v2 row count changed; stop and investigate';
  end if;

  insert into public.profiles (id, display_name)
  values (v_sarit, 'Sarit')
  on conflict (id) do update set display_name = 'Sarit', updated_at = now();
  update public.couples set created_by = v_sarit, updated_at = now() where id = v_run.target_couple_id;
  update public.couple_members set role = 'member', status = 'left'
    where couple_id = v_run.target_couple_id and user_id <> v_sarit;
  insert into public.couple_members (couple_id, user_id, role, status)
  values (v_run.target_couple_id, v_sarit, 'owner', 'active')
  on conflict (couple_id, user_id) do update set role = 'owner', status = 'active';
  update public.cycle_subjects set profile_id = v_sarit, display_name = 'Sarit', updated_at = now()
    where id = v_run.target_subject_id;
  update public.cycle_entries_v2 set recorded_by = v_sarit where subject_id = v_run.target_subject_id;
  update public.migration_runs set created_by = v_sarit, updated_at = now() where source = 'legacy-couple-1';
  update private.legacy_claim_authorizations set consumed_at = coalesce(consumed_at, now()), consumed_by = v_sarit
    where source = 'legacy-couple-1';
end $$;

commit;

select u.email as cycle_owner_email, s.display_name as cycle_subject,
       m.source_count, m.destination_count, count(e.*) as current_v2_rows
from public.migration_runs m
join public.cycle_subjects s on s.id = m.target_subject_id
join auth.users u on u.id = s.profile_id
left join public.cycle_entries_v2 e on e.subject_id = s.id
where m.source = 'legacy-couple-1'
group by u.email, s.display_name, m.source_count, m.destination_count;

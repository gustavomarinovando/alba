-- Relationship status, voluntary partner departure, and owner removal.
create or replace function public.get_partner_status()
returns table (partner_email text)
language sql security definer set search_path = public, private, auth
stable
as $$
  select u.email::text
  from public.couple_members me
  join public.couple_members partner on partner.couple_id = me.couple_id
    and partner.user_id <> me.user_id and partner.status = 'active'
  join auth.users u on u.id = partner.user_id
  where me.user_id = auth.uid() and me.status = 'active'
  limit 1
$$;

create or replace function public.leave_couple()
returns void language plpgsql security definer set search_path = public, private
as $$
begin
  if not exists (select 1 from public.couple_members where user_id = auth.uid() and role = 'member' and status = 'active') then
    raise exception 'Solo una pareja invitada puede salir del vínculo';
  end if;
  update public.couple_members set status = 'left'
  where user_id = auth.uid() and role = 'member' and status = 'active';
end $$;

create or replace function public.remove_partner()
returns void language plpgsql security definer set search_path = public, private
as $$
declare v_couple uuid;
begin
  select couple_id into v_couple from public.couple_members
  where user_id = auth.uid() and role = 'owner' and status = 'active' limit 1;
  if v_couple is null then raise exception 'Solo la dueña puede retirar a la pareja'; end if;
  update public.couple_members set status = 'left'
  where couple_id = v_couple and role = 'member' and status = 'active';
end $$;

revoke all on function public.get_partner_status() from public, anon;
revoke all on function public.leave_couple() from public, anon;
revoke all on function public.remove_partner() from public, anon;
grant execute on function public.get_partner_status() to authenticated;
grant execute on function public.leave_couple() to authenticated;
grant execute on function public.remove_partner() to authenticated;

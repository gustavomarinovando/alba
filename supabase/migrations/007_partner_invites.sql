-- Owner-created, single-use partner invitations. Codes expire after seven days.
create or replace function public.create_partner_invite()
returns table (invite_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, private, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_couple uuid;
  v_code text := upper(encode(gen_random_bytes(6), 'hex'));
  v_expires timestamptz := now() + interval '7 days';
begin
  select couple_id into v_couple from public.couple_members
  where user_id = v_user and role = 'owner' and status = 'active' limit 1;
  if v_couple is null then raise exception 'Solo la dueña puede crear invitaciones'; end if;
  update public.couple_invites set expires_at = now()
    where couple_id = v_couple and used_at is null and expires_at > now();
  insert into public.couple_invites(couple_id, created_by, token_hash, expires_at)
  values (v_couple, v_user, encode(digest(v_code, 'sha256'), 'hex'), v_expires);
  return query select v_code, v_expires;
end $$;

create or replace function public.accept_partner_invite(invite_code text)
returns void language plpgsql security definer set search_path = public, private, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.couple_invites%rowtype;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  select * into v_invite from public.couple_invites
  where token_hash = encode(digest(upper(trim(invite_code)), 'sha256'), 'hex')
    and used_at is null and expires_at > now() for update;
  if not found then raise exception 'La invitación no existe, expiró o ya fue usada'; end if;
  if exists (select 1 from public.couple_members where user_id = v_user and status = 'active') then
    raise exception 'Esta cuenta ya pertenece a una pareja';
  end if;
  insert into public.couple_members(couple_id, user_id, role, status)
  values (v_invite.couple_id, v_user, 'member', 'active')
  on conflict (couple_id, user_id) do update set role = 'member', status = 'active';
  update public.couple_invites set used_at = now(), used_by = v_user where id = v_invite.id;
end $$;

revoke all on function public.create_partner_invite() from public, anon;
revoke all on function public.accept_partner_invite(text) from public, anon;
grant execute on function public.create_partner_invite() to authenticated;
grant execute on function public.accept_partner_invite(text) to authenticated;

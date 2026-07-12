-- Normalize copied invite codes and provide deterministic redemption behavior.
create or replace function public.accept_partner_invite(invite_code text)
returns void
language plpgsql security definer set search_path = public, private, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(invite_code, ''), '[^0-9A-F]', '', 'g'));
  v_invite public.couple_invites%rowtype;
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;
  if length(v_code) <> 12 then raise exception 'El código debe tener 12 caracteres'; end if;

  select ci.* into v_invite
  from public.couple_invites ci
  where ci.token_hash = encode(extensions.digest(v_code, 'sha256'), 'hex')
    and ci.used_at is null
    and ci.expires_at > now()
  for update;

  if not found then
    raise exception 'El código no existe, venció, fue reemplazado o ya fue usado';
  end if;

  if v_invite.created_by = v_user then
    raise exception 'La dueña no puede usar su propia invitación';
  end if;

  if exists (
    select 1 from public.couple_members cm
    where cm.user_id = v_user and cm.status = 'active' and cm.couple_id <> v_invite.couple_id
  ) then
    raise exception 'Esta cuenta ya pertenece a otra pareja';
  end if;

  insert into public.couple_members(couple_id, user_id, role, status)
  values (v_invite.couple_id, v_user, 'member', 'active')
  on conflict (couple_id, user_id)
  do update set role = 'member', status = 'active';

  update public.couple_invites ci
  set used_at = now(), used_by = v_user
  where ci.id = v_invite.id;
end $$;

revoke all on function public.accept_partner_invite(text) from public, anon;
grant execute on function public.accept_partner_invite(text) to authenticated;

-- Fix PL/pgSQL output-column ambiguity in create_partner_invite().
create or replace function public.create_partner_invite()
returns table (invite_code text, expires_at timestamptz)
language plpgsql security definer set search_path = public, private, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_couple uuid;
  v_code text := upper(encode(extensions.gen_random_bytes(6), 'hex'));
  v_expires timestamptz := now() + interval '7 days';
begin
  if v_user is null then raise exception 'Debes iniciar sesión'; end if;

  select cm.couple_id into v_couple
  from public.couple_members cm
  where cm.user_id = v_user and cm.role = 'owner' and cm.status = 'active'
  limit 1;

  if v_couple is null then raise exception 'Solo la dueña puede crear invitaciones'; end if;

  update public.couple_invites ci
  set expires_at = now()
  where ci.couple_id = v_couple and ci.used_at is null and ci.expires_at > now();

  insert into public.couple_invites(couple_id, created_by, token_hash, expires_at)
  values (v_couple, v_user, encode(extensions.digest(v_code, 'sha256'), 'hex'), v_expires);

  return query select v_code::text, v_expires::timestamptz;
end $$;

revoke all on function public.create_partner_invite() from public, anon;
grant execute on function public.create_partner_invite() to authenticated;

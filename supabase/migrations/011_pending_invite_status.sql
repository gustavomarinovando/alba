-- Let the owner see that an unused, unexpired invite exists (codes are stored
-- hashed, so the plaintext can only be shown on the device that created it).
create or replace function public.get_pending_invite_status()
returns table (expires_at timestamptz)
language sql security definer set search_path = public, private
stable
as $$
  select ci.expires_at
  from public.couple_invites ci
  join public.couple_members cm on cm.couple_id = ci.couple_id
    and cm.user_id = auth.uid() and cm.role = 'owner' and cm.status = 'active'
  where ci.used_at is null and ci.expires_at > now()
  order by ci.expires_at desc
  limit 1
$$;

revoke all on function public.get_pending_invite_status() from public, anon;
grant execute on function public.get_pending_invite_status() to authenticated;

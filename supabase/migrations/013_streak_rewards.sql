-- Streak rewards: coupons a partner builds for the cycle owner (or vice
-- versa). Unlock is computed client-side from the observation streak; the
-- database stores the coupon and its redemption.
create table if not exists public.streak_rewards (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  title text not null check (char_length(title) between 1 and 80),
  description text not null default '' check (char_length(description) <= 240),
  emoji text not null default '🎁' check (char_length(emoji) <= 8),
  category text not null default 'custom' check (category in ('comida', 'citas', 'picante', 'mimos', 'custom')),
  threshold_days integer not null check (threshold_days between 1 and 365),
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists streak_rewards_couple_idx on public.streak_rewards(couple_id, created_at);

alter table public.streak_rewards enable row level security;

drop policy if exists "streak_rewards_select_member" on public.streak_rewards;
create policy "streak_rewards_select_member" on public.streak_rewards for select to authenticated
using ((select private.is_active_couple_member(couple_id)));

drop policy if exists "streak_rewards_insert_member" on public.streak_rewards;
create policy "streak_rewards_insert_member" on public.streak_rewards for insert to authenticated
with check ((select private.is_active_couple_member(couple_id)) and created_by = (select auth.uid()));

drop policy if exists "streak_rewards_update_member" on public.streak_rewards;
create policy "streak_rewards_update_member" on public.streak_rewards for update to authenticated
using ((select private.is_active_couple_member(couple_id)))
with check ((select private.is_active_couple_member(couple_id)));

drop policy if exists "streak_rewards_delete_creator" on public.streak_rewards;
create policy "streak_rewards_delete_creator" on public.streak_rewards for delete to authenticated
using (created_by = (select auth.uid()) and (select private.is_active_couple_member(couple_id)));

grant select, insert, update, delete on public.streak_rewards to authenticated;

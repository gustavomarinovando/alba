-- Adds a currency-priced unlock path alongside the existing streak-day threshold. A coupon is
-- either streak-gated (threshold_days) or currency-gated (price, in "huellitas"), decided at
-- creation time; the app enforces exactly one is set, this constraint backs that up server-side.
-- Currency earned/spent is computed client-side from entries + redemptions, same as the streak
-- itself already is — no new balance table needed.
alter table public.streak_rewards
  alter column threshold_days drop not null;

alter table public.streak_rewards
  add column if not exists price integer check (price between 1 and 100000);

alter table public.streak_rewards
  drop constraint if exists streak_rewards_unlock_method_check;

alter table public.streak_rewards
  add constraint streak_rewards_unlock_method_check
  check (
    (threshold_days is not null and price is null)
    or (threshold_days is null and price is not null)
  );

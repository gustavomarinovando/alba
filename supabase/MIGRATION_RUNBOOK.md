# Supabase UUID migration runbook

The current production app continues using `public.cycle_entries` with `couple_id = 1`. These scripts are additive: they do not cut the app over and do not remove the legacy table or its policies.

## Before running SQL

1. In Alba, export the current JSON backup and verify that the file opens as JSON.
2. In Supabase, export or otherwise snapshot `public.cycle_entries` for `couple_id = 1`.
3. Record the legacy row count and date range:

```sql
select count(*) as rows, min(date) as first_date, max(date) as last_date
from public.cycle_entries
where couple_id = 1;
```

4. Create the first user through Supabase Authentication and confirm their email.

## Execution order

1. Run `migrations/001_accounts_sync_v2.sql` in the SQL Editor. This creates only additive v2 structures and policies.
2. Open `migrations/002_seed_and_copy_legacy_couple.sql`, replace `REPLACE_ME@example.com` and `REPLACE_ME`, then run it.
3. Confirm its final result contains `status = verified` with equal counts and hashes.
4. Run `migrations/003_verify_legacy_copy.sql`. Its first result must contain `verified = true`.
5. Stop. Do not disable the old policies yet. The frontend still targets the legacy table until the authenticated sync client is implemented and deployed.

## What is intentionally deferred

- Partner invitation RPCs and UI.
- Authenticated frontend cutover.
- Migrating push subscription endpoints; devices should register fresh under authenticated ownership.
- Revoking the anonymous `couple_id = 1` policies.
- Dropping any legacy table.

## Rollback before frontend cutover

No rollback is required merely because v2 exists; the current app ignores it. If the copied v2 dataset must be removed, first verify that the legacy table and local JSON export are intact, then run this transaction manually:

```sql
begin;

delete from public.cycle_entries_v2 e
using public.migration_runs m
where m.source = 'legacy-couple-1'
  and e.couple_id = m.target_couple_id
  and e.subject_id = m.target_subject_id;

update public.migration_runs
set status = 'rolled_back', updated_at = now()
where source = 'legacy-couple-1';

commit;
```

This rollback does not touch `public.cycle_entries`. Do not drop the v2 schema or legacy data during the initial rollout.

## Cutover gate

The legacy anonymous policies can be removed only after:

- authenticated save, pull, delete, and Realtime work against `cycle_entries_v2`;
- both devices show the same row count/hash;
- offline queued mutations survive logout/login and reconnect;
- a fresh export has been created after the v2 deployment;
- `migration_runs.status` is explicitly changed to `cutover`.

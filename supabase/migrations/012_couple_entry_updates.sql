-- Fix: syncing devices upsert the whole merged entry set, but the update
-- policy required recorded_by = auth.uid() on the EXISTING row, so touching a
-- row recorded by the other partner failed and aborted the entire batch —
-- new temperatures never reached the database. Both active couple members may
-- now update their couple's entries; inserts still stamp the writer.
drop policy if exists "cycle_entries_v2_update_member" on public.cycle_entries_v2;
create policy "cycle_entries_v2_update_member" on public.cycle_entries_v2 for update to authenticated
using ((select private.is_active_couple_member(couple_id)))
with check ((select private.is_active_couple_member(couple_id)) and recorded_by = (select auth.uid()));

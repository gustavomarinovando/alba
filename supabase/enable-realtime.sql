-- Run once in Supabase Dashboard > SQL Editor.
-- This does not modify any cycle entry.

alter table public.cycle_entries replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cycle_entries'
  ) then
    alter publication supabase_realtime add table public.cycle_entries;
  end if;
end $$;

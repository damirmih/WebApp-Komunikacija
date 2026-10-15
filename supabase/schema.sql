-- Komunikacija · plan. Pokreni u Supabase SQL editoru (jednom).
-- Jedna tabela za sav progres; svaki red pripada jednom korisniku (auth.uid()).

create table if not exists public.entries (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('done', 'journal', 'challenge', 'metrics', 'settings')),
  key        text not null,
  data       jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, key)
);

create index if not exists entries_user_kind_idx on public.entries (user_id, kind);

alter table public.entries enable row level security;

drop policy if exists "own rows select" on public.entries;
drop policy if exists "own rows insert" on public.entries;
drop policy if exists "own rows update" on public.entries;
drop policy if exists "own rows delete" on public.entries;

create policy "own rows select" on public.entries for select using (auth.uid() = user_id);
create policy "own rows insert" on public.entries for insert with check (auth.uid() = user_id);
create policy "own rows update" on public.entries for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows delete" on public.entries for delete using (auth.uid() = user_id);

-- Pregled za Claude (service role ili SQL editor): urađeni zadaci po danu
create or replace view public.progress_by_day as
select user_id,
       split_part(key, '|', 1) as day,
       count(*) filter (where data is not null) as done
from public.entries
where kind = 'done'
group by user_id, split_part(key, '|', 1)
order by day;

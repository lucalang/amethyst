-- Arcade: personal records per game and each account's resumable Sudoku puzzle.

-- ---------------------------------------------------------------------------
-- Personal records
-- ---------------------------------------------------------------------------
-- One row per game (Sudoku: per difficulty). Scores are higher-is-better
-- except Sudoku, which stores the fastest completion in seconds.
create table public.arcade_records (
  user_id uuid not null default auth.uid() references public.users (id) on delete cascade,
  game text not null,
  variant text not null default '',
  score integer not null,
  achieved_at timestamptz not null default now(),
  primary key (user_id, game, variant),
  constraint arcade_records_game_valid check (
    (game in ('2048', 'flutter', 'snake', 'fruit-slice', 'stacker') and variant = '' and score between 0 and 100000000)
    or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
  )
);

alter table public.arcade_records enable row level security;
create policy owner_access on public.arcade_records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.arcade_records from public, anon, authenticated;
grant select, delete on public.arcade_records to authenticated;
grant insert (game, variant, score), update (score, achieved_at) on public.arcade_records to authenticated;
grant all on public.arcade_records to service_role;

-- Keep the better of the saved and the new score; reports the resulting best.
create function public.record_arcade_score(p_game text, p_variant text, p_score integer)
returns table (best integer, improved boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_variant text := coalesce(p_variant, '');
  v_best integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.arcade_records as r (game, variant, score)
  values (p_game, v_variant, p_score)
  on conflict (user_id, game, variant) do update
    set score = excluded.score, achieved_at = now()
    where case when r.game = 'sudoku' then excluded.score < r.score else excluded.score > r.score end
  returning r.score into v_best;

  if found then
    return query select v_best, true;
  else
    return query select r.score, false from public.arcade_records r
      where r.user_id = v_user and r.game = p_game and r.variant = v_variant;
  end if;
end;
$$;

revoke execute on function public.record_arcade_score(text, text, integer) from public, anon;
grant execute on function public.record_arcade_score(text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Resumable Sudoku
-- ---------------------------------------------------------------------------
-- Boards are 81 digits in row-major order ('0' = empty). `entries` holds only
-- the player's digits, so the given clues can never be overwritten. `notes`
-- holds one 9-bit pencil-mark mask per cell.
create function public.sudoku_entries_fit(p_puzzle text, p_entries text)
returns boolean
language sql immutable set search_path = '' as $$
  select not exists (
    select 1 from generate_series(1, 81) as i
    where substr(p_puzzle, i, 1) <> '0' and substr(p_entries, i, 1) <> '0'
  );
$$;

create table public.sudoku_games (
  user_id uuid primary key default auth.uid() references public.users (id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  difficulty text not null check (difficulty in ('easy', 'medium', 'hard')),
  puzzle text not null check (puzzle ~ '^[0-9]{81}$'),
  solution text not null check (solution ~ '^[1-9]{81}$'),
  entries text not null default repeat('0', 81) check (entries ~ '^[0-9]{81}$'),
  notes smallint[] not null default array_fill(0::smallint, array[81]),
  elapsed_ms integer not null default 0 check (elapsed_ms between 0 and 2000000000),
  completed_at timestamptz,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sudoku_games_notes_valid check (
    array_ndims(notes) = 1 and cardinality(notes) = 81 and array_position(notes, null) is null
    and 0 <= all (notes) and 511 >= all (notes)
  ),
  constraint sudoku_games_entries_fit check (public.sudoku_entries_fit(puzzle, entries))
);

create trigger sudoku_games_set_updated_at before update on public.sudoku_games
  for each row execute function public.set_updated_at();

alter table public.sudoku_games enable row level security;
create policy owner_access on public.sudoku_games for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.sudoku_games from public, anon, authenticated;
grant select, delete on public.sudoku_games to authenticated;
grant insert (id, difficulty, puzzle, solution, entries, notes, elapsed_ms, completed_at, started_at),
  update (id, difficulty, puzzle, solution, entries, notes, elapsed_ms, completed_at, started_at)
  on public.sudoku_games to authenticated;
grant all on public.sudoku_games to service_role;

-- 2048 board sizes and daily challenges for 2048 and Flutter.
--
-- Records: '' stays each game's original record (classic 4×4 2048, regular Flutter), so every saved
-- best stays where it is. 2048 adds '3x3' and '5x5'; daily challenges keep their best per UTC date as
-- 'daily-YYYY-MM-DD'. The API only accepts today's or yesterday's date; this only keeps the shape sane.
alter table public.arcade_records drop constraint arcade_records_game_valid;
alter table public.arcade_records add constraint arcade_records_game_valid check (
  (game in ('fruit-slice', 'stacker') and variant = '' and score between 0 and 100000000)
  or (game = '2048' and (variant in ('', '3x3', '5x5') or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'flutter' and (variant = '' or variant ~ '^daily-[0-9]{4}-[0-9]{2}-[0-9]{2}$') and score between 0 and 100000000)
  or (game = 'snake' and (variant = '' or variant ~ '^[a-z0-9]+-[a-z]+-[0-9]{1,2}(-(slow|fast))?$') and score between 0 and 100000000)
  or (game = 'sudoku' and variant in ('easy', 'medium', 'hard') and score between 1 and 8640000)
);

-- Runs: 2048 reports its board's cell count ('cells': 9, 16 or 25; missing = the classic 16). A
-- 5×5 board holds more tiles, so its score allowance grows with the board; smaller boards keep the
-- classic allowance. Payouts (rules, caps, daily limit) are unchanged; each run still pays once.
create or replace function public._arcade_run_plausible(p_game text, p_score integer, p_metrics jsonb)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  a numeric;
  b numeric;
begin
  if p_game = '2048' then
    a := public._run_metric(p_metrics, 'maxTile');
    b := coalesce(public._run_metric(p_metrics, 'cells'), 16);
    if a is null or a < 2 or a > 131072 or a <> trunc(a) then return false; end if;
    if (a::bigint & (a::bigint - 1)) <> 0 then return false; end if;
    if b not in (9, 16, 25) then return false; end if;
    -- Every point comes from a merge; a board's merges can't outscore its tiles by more than this.
    return p_score <= (ln(a) / ln(2) - 1) * a * greatest(4, b / 4) + 64;
  elsif p_game = 'flutter' then
    a := public._run_metric(p_metrics, 'obstacles');
    return a is null or a = p_score;
  elsif p_game = 'snake' then
    a := public._run_metric(p_metrics, 'length');
    return a is not null and a = p_score + 3;
  elsif p_game = 'fruit-slice' then
    a := public._run_metric(p_metrics, 'fruitsSliced');
    b := coalesce(public._run_metric(p_metrics, 'maxCombo'), 0);
    -- One point per fruit plus combo bonuses (at most one more point per fruit).
    return a is not null and a <= p_score and p_score <= a * 2 and b >= 0 and b <= a;
  elsif p_game = 'stacker' then
    a := public._run_metric(p_metrics, 'height');
    b := coalesce(public._run_metric(p_metrics, 'perfectStreak'), 0);
    return a is not null and a = p_score and b >= 0 and b <= a;
  end if;
  return true;
end;
$$;
revoke all on function public._arcade_run_plausible(text, integer, jsonb) from public, anon, authenticated;

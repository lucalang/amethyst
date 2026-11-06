"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { AlertTriangle, Crown, Loader2, Play, RotateCcw, Trophy } from "lucide-react";
import { ARCADE_CABINETS } from "@/components/arcade/previews";
import { useSettings } from "@/components/layout/settings-context";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ARCADE_GAMES, formatDuration, type ArcadeGameId } from "@/lib/arcade";
import { LEADERBOARD_GAMES, LEADERBOARD_GAME_IDS, boardLabel, dailyBoards, leaderboardHref, parseSnakeBoard, snakeBoardLabel, snakeBoardOf, type Leaderboard, type LeaderboardRow, type SnakeBoardParts } from "@/lib/leaderboards";
import { FRUIT_COUNT, SNAKE_MODES, SNAKE_MODE_IDS, SNAKE_SIZES, SNAKE_SIZE_IDS, SNAKE_SPEEDS, SNAKE_SPEED_IDS, snakeVariant, isSnakeLeaderboardVariant, type SnakeSize, type SnakeSpeed } from "@/lib/snake";

type Load = { key: string } & ({ status: "ready"; data: Leaderboard } | { status: "error"; unavailable: boolean });

const titleOf = (game: ArcadeGameId) => ARCADE_GAMES.find((entry) => entry.id === game)?.title ?? game;
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function Score({ row, fast }: { row: LeaderboardRow; fast: boolean }) {
  return <span className="lb-score">{fast ? formatDuration(row.score) : row.score.toLocaleString("en")}</span>;
}

function Row({ row, fast, index = 0 }: { row: LeaderboardRow; fast: boolean; index?: number }) {
  return (
    <li className="lb-row enter enter-soft" style={{ "--enter-index": index } as CSSProperties} data-you={row.you ? "" : undefined} data-podium={row.rank <= 3 ? row.rank : undefined}>
      <span className="lb-rank" aria-label={`Rank ${row.rank}`}>
        {row.rank === 1 ? <Crown aria-hidden className="size-3.5" /> : null}
        {row.rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.you ? <span className="ui-pill lb-you" data-tone>You</span> : null}
        </span>
        <span className="block text-xs text-muted-foreground">
          {dateFormat.format(new Date(row.achievedAt))}
          {row.hints ? ` · ${row.hints} hint${row.hints === 1 ? "" : "s"}` : ""}
        </span>
      </span>
      <Score row={row} fast={fast} />
    </li>
  );
}

/** Snake boards offer the player's current setup first. */
export function LeaderboardView({ game: initialGame, board: initialBoard }: { game: ArcadeGameId; board: string }) {
  const snakeSetup = useSettings().arcadeSnake;
  const snakeBoard = snakeSetup.mode === "blender" ? "" : snakeVariant(snakeSetup);
  const [game, setGame] = useState(initialGame);
  const [board, setBoard] = useState(initialBoard);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load | null>(null);
  const [snakeBoards, setSnakeBoards] = useState<{ board: string; players: number }[]>([]);
  const key = `${game}|${board}|${attempt}`;
  const config = LEADERBOARD_GAMES[game];
  const fast = config.order === "fast";
  const daily = board.startsWith("daily-");
  const days = config.daily ? dailyBoards() : [];
  const snakeParts = config.setups && !daily ? parseSnakeBoard(board) : null;
  const pickSnake = (change: Partial<SnakeBoardParts>) => snakeParts && setBoard(snakeBoardOf({ ...snakeParts, ...change }));

  useEffect(() => {
    let live = true;
    const params = new URLSearchParams({ game, board });
    window.history.replaceState(window.history.state, "", leaderboardHref(game, board));
    apiFetch<Leaderboard>(`/api/arcade/leaderboards?${params}`)
      .then((data) => {
        if (!live) return;
        setLoad({ key, status: "ready", data });
        if (data.boards) setSnakeBoards(data.boards.filter(entry => isSnakeLeaderboardVariant(entry.board)));
      })
      .catch((error: unknown) => live && setLoad({ key, status: "error", unavailable: error instanceof ApiError && error.status === 503 }));
    return () => {
      live = false;
    };
  }, [game, board, key]);

  function pickGame(next: ArcadeGameId) {
    setGame(next);
    setBoard(next === "snake" ? snakeBoard : LEADERBOARD_GAMES[next].boards[0].id);
  }

  const current = load?.key === key ? load : null;
  const data = current?.status === "ready" ? current.data : null;
  const youOutside = data?.you && !data.top.some((row) => row.you) ? data.you : null;
  const href = ARCADE_GAMES.find((entry) => entry.id === game)?.href ?? "/arcade";

  return (
    <div className="flex flex-col gap-4" style={{ "--cab": ARCADE_CABINETS[game].hue, "--tone": ARCADE_CABINETS[game].hue } as CSSProperties}>
      <nav aria-label="Games" className="lb-games enter" style={{ "--enter-index": 1 } as CSSProperties}>
        {LEADERBOARD_GAME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            className="lb-game"
            aria-current={id === game ? "page" : undefined}
            style={{ "--tone": ARCADE_CABINETS[id].hue } as CSSProperties}
            onClick={() => pickGame(id)}
          >
            <span aria-hidden className="ui-dot" />
            {titleOf(id)}
          </button>
        ))}
      </nav>

      {snakeParts ? (
        <div className="ui-panel enter flex flex-wrap items-end gap-x-3 gap-y-2 p-3 text-sm text-muted-foreground" style={{ "--enter-index": 2 } as CSSProperties}>
          <label className="flex flex-col gap-1">
            Mode
            <select className="lb-select" value={snakeParts.key} onChange={(event) => pickSnake({ key: event.target.value })}>
              {SNAKE_MODE_IDS.filter((mode) => mode !== "blender").map((mode) => (
                <option key={mode} value={mode}>
                  {SNAKE_MODES[mode].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Size
            <select className="lb-select" value={snakeParts.size} onChange={(event) => pickSnake({ size: event.target.value as SnakeSize })}>
              {SNAKE_SIZE_IDS.map((size) => (
                <option key={size} value={size}>
                  {SNAKE_SIZES[size].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Fruit
            <select className="lb-select" value={snakeParts.count} onChange={(event) => pickSnake({ count: Number(event.target.value) })}>
              {Array.from({ length: FRUIT_COUNT.max - FRUIT_COUNT.min + 1 }, (_, index) => FRUIT_COUNT.min + index).map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Speed
            <select className="lb-select" value={snakeParts.speed} onChange={(event) => pickSnake({ speed: event.target.value as SnakeSpeed })}>
              {SNAKE_SPEED_IDS.map((speed) => (
                <option key={speed} value={speed}>
                  {SNAKE_SPEEDS[speed].label}
                </option>
              ))}
            </select>
          </label>
          {board !== snakeBoard ? (
            <Button size="sm" variant="outline" className="h-9 rounded-xl" onClick={() => setBoard(snakeBoard)}>
              Your setup
            </Button>
          ) : null}
          <button type="button" className="lb-board-pick" aria-pressed={false} onClick={() => setBoard(days[0].id)}>
            Daily
          </button>
          {snakeBoards.length > 0 ? (
            <label className="flex flex-col gap-1">
              Ranked setups
              <select className="lb-select max-w-full" value={snakeBoards.some((entry) => entry.board === board) ? board : "\u0000"} onChange={(event) => setBoard(event.target.value)}>
                <option value={"\u0000"} disabled>
                  {snakeBoards.length} with players
                </option>
                {snakeBoards.map((entry) => (
                  <option key={entry.board || "main"} value={entry.board}>
                    {snakeBoardLabel(entry.board)} · {entry.players}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <div className="enter flex flex-wrap items-center gap-x-4 gap-y-2" style={{ "--enter-index": 2 } as CSSProperties}>
          <div role="group" aria-label="Board" className="lb-boards">
            {(config.setups ? [{ id: snakeBoard, label: "Your setup" }] : config.boards).map((option) => (
              <button key={option.id || "main"} type="button" className="lb-board-pick" aria-pressed={board === option.id} onClick={() => setBoard(option.id)}>
                {option.label}
              </button>
            ))}
            {config.daily ? (
              <button type="button" className="lb-board-pick" aria-pressed={daily} onClick={() => setBoard(days[0].id)}>
                Daily
              </button>
            ) : null}
          </div>
          {daily ? (
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Day
              <select className="lb-select" value={board} onChange={(event) => setBoard(event.target.value)}>
                {days.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      )}

      <section className="lb-panel enter" style={{ "--enter-index": 3 } as CSSProperties} aria-labelledby="lb-title" aria-busy={current === null}>
        <header className="lb-marquee">
          <span className="flex min-w-0 items-center gap-3">
            <span aria-hidden className="ui-icon">
              <Trophy className="size-4" />
            </span>
            <h2 id="lb-title" className="lb-title">
              {titleOf(game)}
              <span className="sr-only"> leaderboard,</span> <span className="lb-variant">{boardLabel(game, board)}</span>
            </h2>
          </span>
          <span className="ui-pill lb-meta tabular-nums">{data ? `${data.players.toLocaleString("en")} player${data.players === 1 ? "" : "s"}` : config.scoreLabel}</span>
        </header>

        {current === null ? (
          <p className="lb-state" role="status">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Loading rankings…
          </p>
        ) : current.status === "error" ? (
          <div className="lb-state" role="alert">
            <AlertTriangle aria-hidden className="size-4 text-rose" />
            {current.unavailable ? "Leaderboards are unavailable right now. Your records are safe." : "The rankings couldn’t be loaded."}
            <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          </div>
        ) : data && data.top.length === 0 ? (
          <div className="lb-state ui-empty">
            <span aria-hidden className="ui-icon">
              <Trophy className="size-4" />
            </span>
            No ranked runs on this board yet.
            <Button asChild size="sm">
              <Link href={href}>
                <Play aria-hidden />
                Set the first score
              </Link>
            </Button>
          </div>
        ) : data ? (
          <>
            <ol className="lb-list" aria-label={`Top ${data.top.length}`}>
              {data.top.map((row, index) => (
                <Row key={`${row.rank}-${index}`} row={row} fast={fast} index={index} />
              ))}
            </ol>
            <footer className="lb-footer">
              {youOutside ? (
                <ol className="lb-list" aria-label="Your placement">
                  <Row row={youOutside} fast={fast} />
                </ol>
              ) : data.you ? null : (
                <p className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm text-muted-foreground">
                  You don’t have a ranked run on this board yet.
                  <Button asChild size="sm" variant="outline">
                    <Link href={href}>
                      <Play aria-hidden />
                      Play {titleOf(game)}
                    </Link>
                  </Button>
                </p>
              )}
            </footer>
          </>
        ) : null}
      </section>

      <p className="px-1 text-xs text-pretty text-muted-foreground">
        {fast ? "Fastest solve first; fewer hints break a tie, then the earlier solve." : "Highest score first; on a tie, whoever reached it first ranks higher."} Only runs the server
        timed and checked are ranked, one best per player. Players appear under their display name, or an anonymous arcade name if they haven’t set one.
      </p>
    </div>
  );
}

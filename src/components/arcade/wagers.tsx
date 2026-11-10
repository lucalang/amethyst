"use client";

import "./competitive.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, Clock, Coins, Hourglass, Info, Loader2, Play, Plus, Swords, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  COMPETITIVE_GAME_IDS,
  GAME_SETTINGS,
  WAGER_RULES_TEXT,
  WAGER_STATUS_LABELS,
  boardLabel,
  compactCoins,
  formatScore,
  gameTitle,
  isCompetitiveGame,
  isWagerBoard,
  lowerWins,
  setupLabel,
  wagerOutcome,
  type CompetitiveGame,
  type PlayerState,
  type Wager,
  type WagerList,
  type WagerRound,
  type WagerRules,
  type WagerState,
} from "@/lib/competitive";
import { LEADERBOARD_GAMES } from "@/lib/leaderboards";
import { cn } from "@/lib/utils";
import { ARCADE_CABINETS, ArcadePreview } from "./previews";

type Pick = { key: number; game: CompetitiveGame; board: string };

const STAKE_PRESETS = [100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];
const SLIDER_STEPS = 1000;

const hue = (game: string) => ({ "--hue": isCompetitiveGame(game) ? ARCADE_CABINETS[game].hue : "#a78bfa" }) as CSSProperties;
const utcTime = (iso: string) => `${new Date(iso).toLocaleString("en", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })} UTC`;
const coins = (n: number) => `${n.toLocaleString("en")} Coin${n === 1 ? "" : "s"}`;
const initial = (name: string) => name.trim().charAt(0).toUpperCase() || "?";
const message = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
const announceBalance = (balance: unknown) => {
  if (typeof balance === "number") window.dispatchEvent(new CustomEvent("archive:coins", { detail: balance }));
};

/** Log-scale slider position ↔ stake, rounded to two significant figures so the slider lands on tidy amounts. */
function sliderToStake(position: number, rules: WagerRules) {
  const raw = rules.minStake * (rules.maxStake / rules.minStake) ** (position / SLIDER_STEPS);
  const unit = 10 ** Math.max(0, Math.floor(Math.log10(raw)) - 1);
  return Math.min(rules.maxStake, Math.max(rules.minStake, Math.round(raw / unit) * unit));
}
function stakeToSlider(stake: number, rules: WagerRules) {
  if (stake <= rules.minStake) return 0;
  return Math.min(SLIDER_STEPS, Math.round((SLIDER_STEPS * Math.log(stake / rules.minStake)) / Math.log(rules.maxStake / rules.minStake)));
}

/** A board for the game not yet picked, preferring its first ranked setting. */
function freeBoard(game: CompetitiveGame, picks: Pick[]) {
  const boards = LEADERBOARD_GAMES[game].boards.map((b) => b.id).filter((board) => isWagerBoard(game, board));
  return boards.find((board) => !picks.some((p) => p.game === game && p.board === board)) ?? boards[0] ?? "";
}

function Spinner() {
  return <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />;
}

function GameDot({ game, board }: { game: string; board: string }) {
  return (
    <span className="cx-dot" style={hue(game)} title={setupLabel(game, board)}>
      {setupLabel(game, board)}
    </span>
  );
}

function Player({ name, you, winner, wins, need }: { name: string; you: boolean; winner?: boolean; wins?: number; need?: number }) {
  return (
    <div className="cx-player" data-you={you} data-winner={winner}>
      <span aria-hidden className="cx-avatar">{initial(name)}</span>
      <span className="max-w-full truncate text-sm font-semibold">
        {name}
        {you ? <span className="ml-1 text-xs font-medium text-muted-foreground">(you)</span> : null}
      </span>
      {need ? (
        <span className="cx-pips" aria-label={`${wins ?? 0} of ${need} round wins`}>
          {Array.from({ length: need }, (_, i) => <span key={i} className="cx-pip" data-on={i < (wins ?? 0)} />)}
        </span>
      ) : null}
    </div>
  );
}

function names(wager: Wager) {
  return {
    host: wager.you === "host" ? "You" : wager.host.name,
    opponent: wager.you === "opponent" ? "You" : wager.opponent?.name ?? "Open seat",
  };
}

/** Whether the viewer still has to play the current round. */
function yourTurn(wager: Wager) {
  if (wager.status !== "active" || !wager.you) return false;
  const round = wager.rounds?.find((r) => r.round === wager.currentRound && !r.outcome);
  return round ? round.yourAttempt === null || (round.game === "sudoku" && round.yourAttempt === "playing") : false;
}

function MatchCard({ wager, accept, busy, balance }: { wager: Wager; accept?: (wager: Wager) => void; busy?: boolean; balance: number }) {
  const { host, opponent } = names(wager);
  const turn = yourTurn(wager);
  const outcome = wager.status === "open" || wager.status === "active" ? null : wagerOutcome(wager);
  const short = balance < wager.stake;
  return (
    <li className="cx-match" data-turn={turn}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="cx-avatar size-9! text-sm!">{initial(wager.host.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {host}
            <span className="mx-1.5 font-normal text-muted-foreground">vs</span>
            <span className={cn(!wager.opponent && "font-normal text-muted-foreground")}>{opponent}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {WAGER_STATUS_LABELS[wager.status]}
            {wager.status === "open" ? ` · expires ${utcTime(wager.expiresAt)}` : wager.status === "active" ? ` · round ${wager.currentRound}` : ""}
          </p>
        </div>
        {wager.opponent ? (
          <span className="text-xl font-extrabold tabular-nums" aria-label={`${wager.hostWins} to ${wager.opponentWins}`}>
            {wager.hostWins}<span className="mx-0.5 text-muted-foreground">–</span>{wager.opponentWins}
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {wager.games.map((g, i) => <GameDot key={i} game={g.game} board={g.board} />)}
      </div>
      {outcome ? <p className="text-xs text-muted-foreground">{outcome}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          <span className="cx-coins">{compactCoins(wager.stake)}</span>
          <span className="text-muted-foreground"> each · pot </span>
          <span className="cx-coins">{compactCoins(wager.pot)}</span>
        </span>
        <span className="ml-auto flex gap-2">
          {accept ? (
            <Button size="sm" onClick={() => accept(wager)} disabled={busy || short} title={short ? "Not enough Coins" : undefined}>
              {busy ? <Spinner /> : <Coins aria-hidden />}
              {short ? "Not enough Coins" : "Accept"}
            </Button>
          ) : null}
          <Button asChild variant={turn ? "default" : "outline"} size="sm">
            <Link href={`/arcade/wagers/${wager.id}`}>{turn ? <><Play aria-hidden />Your turn</> : "View"}</Link>
          </Button>
        </span>
      </div>
    </li>
  );
}

/** The best-of-five rounds a pick plays, e.g. "Rounds 1, 3, 5" for the first of two games. */
function roundsOf(index: number, count: number) {
  const rounds = [1, 2, 3, 4, 5].filter((round) => (round - 1) % count === index);
  return `Round${rounds.length > 1 ? "s" : ""} ${rounds.join(", ")}`;
}

function RoundEditor({ pick, index, count, duplicateOf, onChange, onMove, onRemove }: {
  pick: Pick;
  index: number;
  count: number;
  duplicateOf: number;
  onChange: (board: string) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const spec = GAME_SETTINGS[pick.game];
  const values = spec.values(pick.board);
  const valid = isWagerBoard(pick.game, pick.board);
  const problem = !valid ? "These settings can’t be ranked. Pick another combination." : duplicateOf >= 0 ? `Same game and settings as round ${duplicateOf + 1}.` : null;
  const label = `Round ${index + 1}: ${gameTitle(pick.game)}`;

  return (
    <li className="cx-round" style={hue(pick.game)} data-invalid={problem !== null}>
      <div className="flex items-center gap-3">
        <span className="cx-thumb"><ArcadePreview game={pick.game} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">{roundsOf(index, count)}</p>
          <p className="truncate font-semibold">{gameTitle(pick.game)}</p>
          <p className="truncate text-xs text-muted-foreground">{boardLabel(pick.game, pick.board) || "Standard rules"} · {lowerWins(pick.game) ? "fastest time wins" : "highest score wins"}</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${label} earlier`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Move ${label} later`} disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown aria-hidden />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Remove ${label}`} onClick={onRemove}>
            <X aria-hidden />
          </Button>
        </div>
      </div>
      {spec.settings.length ? (
        <div className="grid gap-3">
          {spec.settings.map((setting) => {
            const selected = setting.options.find((option) => option.id === values[setting.id]);
            return (
              <div key={setting.id} className="cx-setting">
                <span id={`s-${pick.key}-${setting.id}`} className="cx-setting-label">{setting.label}</span>
                <div role="radiogroup" aria-labelledby={`s-${pick.key}-${setting.id}`} className="cx-chips">
                  {setting.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={option.id === values[setting.id]}
                      title={option.hint}
                      className="cx-chip"
                      onClick={() => onChange(spec.board({ ...values, [setting.id]: option.id }))}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {selected?.hint ? <p className="text-xs text-muted-foreground">{selected.hint}</p> : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Standard rules. Puzzles in a round are generated from a shared seed, so both players solve the same one.</p>
      )}
      {problem ? <p role="alert" className="text-xs font-medium text-destructive">{problem}</p> : null}
    </li>
  );
}

/** Wagers hub: build a challenge, accept someone else's, and follow your own matches. */
export function WagerHub({ initial: initialState }: { initial: WagerList | null }) {
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [stake, setStake] = useState(() => {
    if (!initialState) return 0;
    const { rules, balance } = initialState;
    return Math.min(rules.maxStake, Math.max(rules.minStake, Math.min(1_000, balance)));
  });
  const [picks, setPicks] = useState<Pick[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [request, setRequest] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialState ? null : "Wagers couldn’t be loaded.");

  async function refresh() {
    try {
      setState(await apiFetch<WagerList>("/api/competitive/wagers"));
      setError(null);
    } catch (err) {
      setError(message(err, "Wagers couldn’t be loaded."));
    }
  }

  if (!state) {
    return (
      <div role="alert" className="ui-card flex flex-wrap items-center gap-3 p-4 text-sm">
        {error}
        <Button variant="outline" size="sm" onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  const { rules, balance } = state;
  const stakeValid = Number.isInteger(stake) && stake >= rules.minStake && stake <= rules.maxStake;
  const affordable = stakeValid && stake <= balance;
  const duplicates = picks.map((pick, i) => picks.findIndex((other, j) => j < i && other.game === pick.game && other.board === pick.board));
  const picksValid = picks.length > 0 && picks.every((pick, i) => duplicates[i] < 0 && isWagerBoard(pick.game, pick.board));
  const canCreate = affordable && picksValid;
  const maxAffordable = Math.min(rules.maxStake, balance);

  function edit(update: (list: Pick[]) => Pick[]) {
    setRequest(null);
    setPicks(update);
  }
  function add(game: CompetitiveGame) {
    if (picks.length >= rules.maxGames) return;
    edit((list) => [...list, { key: nextKey, game, board: freeBoard(game, list) }]);
    setNextKey((key) => key + 1);
  }
  function move(index: number, delta: -1 | 1) {
    edit((list) => {
      const next = [...list];
      [next[index], next[index + delta]] = [next[index + delta], next[index]];
      return next;
    });
  }
  function changeStake(value: number) {
    setRequest(null);
    setStake(value);
  }

  async function create() {
    if (!request) return;
    setBusy("create");
    try {
      const { wager } = await apiFetch<{ wager: Wager }>("/api/competitive/wagers", {
        method: "POST",
        json: { request, stake, games: picks.map(({ game, board }) => ({ game, board })) },
      });
      toast.success(`Challenge open. ${coins(stake)} held in escrow.`);
      announceBalance(balance - stake);
      router.push(`/arcade/wagers/${wager.id}`);
    } catch (err) {
      toast.error(message(err, "The challenge couldn’t be created, and no Coins were taken."));
      if (err instanceof ApiError && err.status !== 0 && err.status < 500) setRequest(null);
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function accept(wager: Wager) {
    setBusy(wager.id);
    try {
      await apiFetch(`/api/competitive/wagers/${wager.id}`, { method: "POST", json: { action: "accept", expectedStake: wager.stake } });
      toast.success(`Challenge accepted. ${coins(wager.stake)} held in escrow.`);
      announceBalance(balance - wager.stake);
      router.push(`/arcade/wagers/${wager.id}`);
    } catch (err) {
      toast.error(message(err, "The challenge couldn’t be accepted, and no Coins were taken."));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = state.mine.filter((w) => w.status === "open" || w.status === "active");
  const finished = state.mine.filter((w) => w.status !== "open" && w.status !== "active");
  const won = finished.filter((w) => w.status === "completed" && w.winner === w.you).length;
  const lost = finished.filter((w) => w.status === "completed" && w.winner !== w.you).length;
  const fill = `${(stakeToSlider(stake, rules) / SLIDER_STEPS) * 100}%`;

  return (
    <div className="cx space-y-6">
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <section aria-labelledby="w-hero" className="cx-hero enter grid gap-5" style={{ "--enter-index": 0 } as CSSProperties}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-0 flex-1">
            <p className="cx-kicker"><Swords aria-hidden className="size-3.5" />The arena</p>
            <h2 id="w-hero" className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Put your Coins on the line</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Pick any minigames, tune their settings and set a stake up to {compactCoins(rules.maxStake)} Coins. First to {rules.winsNeeded} round wins takes the pot.
            </p>
          </div>
          <Button asChild size="lg">
            <a href="#w-build"><Plus aria-hidden />New challenge</a>
          </Button>
        </div>
        <dl className="cx-stats">
          <div className="cx-stat"><dt>Your balance</dt><dd className="cx-coins">{compactCoins(balance)}</dd></div>
          <div className="cx-stat"><dt>Live matches</dt><dd>{active.length}</dd></div>
          <div className="cx-stat"><dt>Open challenges</dt><dd>{state.open.length}</dd></div>
          <div className="cx-stat"><dt>Your record</dt><dd>{won}W · {lost}L</dd></div>
        </dl>
      </section>

      {active.length ? (
        <section aria-labelledby="w-mine" className="space-y-3">
          <h2 id="w-mine" className="cx-title"><Trophy aria-hidden className="size-4 text-[var(--cx-accent)]" />Your matches</h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {active.map((wager) => <MatchCard key={wager.id} wager={wager} balance={balance} />)}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="w-build" id="w-build" className="grid scroll-mt-20 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="cx-panel space-y-5">
          <div className="space-y-3">
            <h2 id="w-build-games" className="cx-title">
              <span className="cx-step">1</span>
              Pick the games
              <span className="ml-auto text-xs font-medium text-muted-foreground">{picks.length}/{rules.maxGames} rounds</span>
            </h2>
            <div className="cx-tiles" role="group" aria-labelledby="w-build-games">
              {COMPETITIVE_GAME_IDS.map((game) => {
                const count = picks.filter((p) => p.game === game).length;
                const full = picks.length >= rules.maxGames || (count > 0 && GAME_SETTINGS[game].settings.length === 0);
                return (
                  <button
                    key={game}
                    type="button"
                    className="cx-tile"
                    style={hue(game)}
                    data-picked={count > 0}
                    disabled={full}
                    onClick={() => add(game)}
                    aria-label={`Add ${gameTitle(game)}${count ? ` (picked ${count})` : ""}`}
                  >
                    <span className="cx-art"><ArcadePreview game={game} /></span>
                    {count ? <span aria-hidden className="cx-count">{count}</span> : null}
                    <span className="cx-tile-body">
                      <span className="truncate">{gameTitle(game)}</span>
                      <span className="cx-genre">{ARCADE_CABINETS[game].genre}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="cx-title">
              <span className="cx-step">2</span>
              Tune each round
            </h2>
            {picks.length ? (
              <ol className="grid gap-3">
                {picks.map((pick, i) => (
                  <RoundEditor
                    key={pick.key}
                    pick={pick}
                    index={i}
                    count={picks.length}
                    duplicateOf={duplicates[i]}
                    onChange={(board) => edit((list) => list.map((p) => (p.key === pick.key ? { ...p, board } : p)))}
                    onMove={(delta) => move(i, delta)}
                    onRemove={() => edit((list) => list.filter((p) => p.key !== pick.key))}
                  />
                ))}
              </ol>
            ) : (
              <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Add up to {rules.maxGames} games above. Rounds play in this order and cycle if the match runs longer.
              </p>
            )}
          </div>
        </div>

        <aside className="cx-panel space-y-4 self-start lg:sticky lg:top-20" aria-labelledby="w-stake-title">
          <h2 id="w-stake-title" className="cx-title">
            <span className="cx-step">3</span>
            Set the stake
          </h2>
          <div>
            <p className="cx-stake-value cx-coins" aria-hidden>{compactCoins(stake)}</p>
            <p className="text-xs text-muted-foreground">Coins each. Your opponent matches it.</p>
          </div>
          <input
            type="range"
            className="cx-range"
            style={{ "--fill": fill } as CSSProperties}
            min={0}
            max={SLIDER_STEPS}
            value={stakeToSlider(stake, rules)}
            onChange={(event) => changeStake(sliderToStake(Number(event.target.value), rules))}
            aria-label="Stake"
            aria-valuetext={coins(stake)}
          />
          <div className="cx-chips" role="group" aria-label="Stake presets">
            {STAKE_PRESETS.filter((value) => value >= rules.minStake && value <= rules.maxStake).map((value) => (
              <button key={value} type="button" className="cx-chip" aria-pressed={stake === value} disabled={value > balance} onClick={() => changeStake(value)}>
                {compactCoins(value)}
              </button>
            ))}
            <button type="button" className="cx-chip" aria-pressed={stake === maxAffordable} disabled={maxAffordable < rules.minStake} onClick={() => changeStake(maxAffordable)}>
              Max
            </button>
          </div>
          <div className="space-y-1">
            <label htmlFor="w-stake" className="text-xs font-medium text-muted-foreground">Exact amount</label>
            <input
              id="w-stake"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={stake ? stake.toLocaleString("en") : ""}
              onChange={(event) => changeStake(Math.min(Number(event.target.value.replace(/\D/g, "").slice(0, 12)) || 0, 1e12))}
              aria-invalid={!affordable}
              aria-describedby="w-stake-note"
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p id="w-stake-note" className={cn("text-xs", !affordable ? "text-destructive" : "text-muted-foreground")}>
              {!stakeValid
                ? `Pick a whole number from ${rules.minStake.toLocaleString("en")} to ${rules.maxStake.toLocaleString("en")}.`
                : !affordable
                  ? `Not enough Coins. You have ${coins(balance)}.`
                  : `Balance after: ${coins(balance - stake)}.`}
            </p>
          </div>

          <div className="cx-pot space-y-1">
            <p className="text-xs text-muted-foreground">Winner takes</p>
            <p className="text-2xl font-extrabold"><span className="cx-coins">{stakeValid ? (stake * 2).toLocaleString("en") : "–"}</span> <span className="text-sm font-medium text-muted-foreground">Coins</span></p>
            <p className="text-xs text-muted-foreground">
              {picks.length ? `${picks.length} game${picks.length === 1 ? "" : "s"} · best of five · ${rules.roundHours} h per round` : "Pick at least one game."}
            </p>
          </div>

          {balance < rules.minStake ? (
            <p role="status" className="rounded-lg border border-amber-400/50 bg-amber-400/10 px-3 py-2 text-xs">
              You need at least {coins(rules.minStake)} to open or accept a challenge. Earn Coins in any arcade game.
            </p>
          ) : null}

          {request ? (
            <div role="group" aria-label="Confirm challenge" className="space-y-3 rounded-xl border border-[var(--cx-accent)]/50 bg-[var(--cx-accent)]/10 p-3 text-sm">
              <p><span className="font-semibold">{coins(stake)}</span> leaves your balance now and is held until the match ends or you cancel the open challenge.</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => setRequest(null)} disabled={busy === "create"}>Back</Button>
                <Button size="sm" className="flex-1" onClick={() => void create()} disabled={busy === "create"}>
                  {busy === "create" ? <Spinner /> : <Check aria-hidden />}
                  Confirm
                </Button>
              </div>
            </div>
          ) : (
            <Button size="lg" className="w-full" onClick={() => setRequest(crypto.randomUUID())} disabled={!canCreate}>
              <Swords aria-hidden />
              Open challenge
            </Button>
          )}
        </aside>
      </section>

      <section aria-labelledby="w-open" className="space-y-3">
        <h2 id="w-open" className="cx-title"><Coins aria-hidden className="size-4 text-[var(--cx-gold)]" />Open challenges</h2>
        {state.open.length ? (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {state.open.map((wager) => (
              <MatchCard key={wager.id} wager={wager} balance={balance} busy={busy === wager.id} accept={(w) => void accept(w)} />
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            No open challenges from other players right now. Open one of your own above.
          </p>
        )}
      </section>

      {finished.length ? (
        <section aria-labelledby="w-finished" className="space-y-3">
          <h2 id="w-finished" className="cx-title text-muted-foreground">Finished matches</h2>
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {finished.map((wager) => <MatchCard key={wager.id} wager={wager} balance={balance} />)}
          </ul>
        </section>
      ) : null}

      <details className="cx-panel group">
        <summary className="cx-title cursor-pointer list-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Info aria-hidden className="size-4 text-[var(--cx-accent)]" />
          How wagers work
          <span className="ml-auto text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
          <span className="ml-auto hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-foreground/90">
          {WAGER_RULES_TEXT(rules).map((rule) => <li key={rule}>{rule}</li>)}
          <li>Stakes run from {coins(rules.minStake)} to {coins(rules.maxStake)}. You can have up to {rules.maxOpen} open challenges at a time.</li>
        </ul>
      </details>
    </div>
  );
}

const PLAYER_STATE: Record<PlayerState, string> = { waiting: "Hasn’t played", playing: "Playing now", done: "Finished" };
const TERMINAL = new Set(["cancelled", "expired", "completed", "drawn", "abandoned"]);

function roundResult(round: WagerRound, wager: Wager) {
  if (!round.outcome) return "In progress";
  if (round.outcome === "void") return "Void";
  if (round.outcome === "tie") return "Tie";
  const name = round.outcome === wager.you ? "You" : round.outcome === "host" ? wager.host.name : wager.opponent?.name ?? "Opponent";
  return `${name} won${round.reason === "forfeit" ? " by forfeit" : ""}`;
}

function slotState(round: WagerRound | undefined, wager: Wager) {
  if (!round) return "upcoming";
  if (!round.outcome) return "live";
  if (round.outcome === "host" || round.outcome === "opponent") {
    const viewer = wager.you ?? "host";
    return round.outcome === viewer ? "won" : "lost";
  }
  return "even";
}

/** One wager: live status, rounds and the next step, refreshed every few seconds while it can change. */
export function WagerMatch({ initial: initialState }: { initial: WagerState }) {
  const router = useRouter();
  const [wager, setWager] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const live = !TERMINAL.has(wager.status);

  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      apiFetch<WagerState>(`/api/competitive/wagers/${wager.id}`)
        .then((next) => {
          setWager(next);
          setStale(false);
        })
        .catch(() => setStale(true));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [live, wager.id]);

  async function act(action: "accept" | "cancel") {
    setBusy(true);
    try {
      await apiFetch(`/api/competitive/wagers/${wager.id}`, { method: "POST", json: action === "accept" ? { action, expectedStake: wager.stake } : { action } });
      const next = await apiFetch<WagerState>(`/api/competitive/wagers/${wager.id}`);
      setWager(next);
      announceBalance(next.balance);
      toast.success(action === "accept" ? `Accepted. ${coins(wager.stake)} held in escrow.` : `Cancelled. ${coins(wager.stake)} refunded.`);
      router.refresh();
    } catch (err) {
      toast.error(message(err, action === "accept" ? "The challenge couldn’t be accepted, and no Coins were taken." : "The challenge couldn’t be cancelled."));
    } finally {
      setBusy(false);
    }
  }

  const current = wager.status === "active" ? wager.rounds.find((r) => r.round === wager.currentRound && !r.outcome) ?? null : null;
  const mine = current && wager.you ? (wager.you === "host" ? current.hostState : current.opponentState) : null;
  const theirs = current && wager.you ? (wager.you === "host" ? current.opponentState : current.hostState) : null;
  const resumable = current?.game === "sudoku" && current.yourAttempt === "playing";
  const outcome = wagerOutcome(wager);
  const { host, opponent } = names(wager);
  const slots = live ? Math.min(wager.maxRounds, Math.max(wager.rounds.length, wager.winsNeeded * 2 - 1)) : wager.rounds.length;
  const yourState =
    current?.yourAttempt === "invalid" ? "No valid result" : current?.yourAttempt === "late" ? "Too late" : resumable ? "Solving" : PLAYER_STATE[mine ?? "waiting"];

  return (
    <div className="cx space-y-5">
      <section aria-labelledby="m-head" className="cx-hero space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <p id="m-head" className="cx-kicker"><Swords aria-hidden className="size-3.5" />{WAGER_STATUS_LABELS[wager.status]}</p>
          <span className="ml-auto text-sm">
            <span className="cx-coins">{wager.stake.toLocaleString("en")}</span>
            <span className="text-muted-foreground"> each · pot </span>
            <span className="cx-coins">{wager.pot.toLocaleString("en")}</span>
          </span>
        </div>
        <div className="cx-versus">
          <Player name={host} you={wager.you === "host"} winner={wager.winner === "host"} wins={wager.hostWins} need={wager.opponent ? wager.winsNeeded : undefined} />
          <div className="text-center">
            {wager.opponent ? (
              <p className="cx-score" aria-label={`${wager.hostWins} to ${wager.opponentWins}`}>
                {wager.hostWins}<span className="mx-1 text-muted-foreground">:</span>{wager.opponentWins}
              </p>
            ) : (
              <p className="cx-score text-muted-foreground">VS</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">First to {wager.winsNeeded}</p>
          </div>
          <Player name={opponent} you={wager.you === "opponent"} winner={wager.winner === "opponent"} wins={wager.opponentWins} need={wager.opponent ? wager.winsNeeded : undefined} />
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {wager.games.map((g, i) => <GameDot key={i} game={g.game} board={g.board} />)}
        </div>
        {outcome ? <p role="status" className="text-center text-sm font-semibold">{outcome}</p> : null}
        {stale ? <p role="status" className="text-center text-xs text-amber-400">Couldn’t refresh. Retrying…</p> : null}

        {wager.status === "open" ? (
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
            <span className="text-muted-foreground">Waiting for a challenger until {utcTime(wager.expiresAt)}.</span>
            {wager.you === "host" ? (
              <Button variant="outline" size="sm" onClick={() => void act("cancel")} disabled={busy}>
                {busy ? <Spinner /> : <X aria-hidden />}
                Cancel and refund
              </Button>
            ) : (
              <Button size="sm" onClick={() => void act("accept")} disabled={busy || wager.balance < wager.stake}>
                {busy ? <Spinner /> : <Coins aria-hidden />}
                {wager.balance < wager.stake ? "Not enough Coins" : `Accept for ${coins(wager.stake)}`}
              </Button>
            )}
          </div>
        ) : null}
      </section>

      {current ? (
        <section aria-labelledby="m-round" aria-live="polite" className="cx-panel grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]" style={hue(current.game)}>
          <span className="cx-thumb w-full!">{isCompetitiveGame(current.game) ? <ArcadePreview game={current.game} /> : null}</span>
          <div className="space-y-3">
            <div>
              <p className="cx-kicker">Round {current.round}</p>
              <h2 id="m-round" className="text-lg font-bold">{setupLabel(current.game, current.board)}</h2>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock aria-hidden className="size-3.5" />
                Due {utcTime(current.deadline)} · one run each · {current.direction === "low" ? "the faster time wins" : "the higher score wins"}
              </p>
            </div>
            {wager.you ? (
              <>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="cx-dot" style={{ "--hue": "var(--cx-accent)" } as CSSProperties}>You: {yourState}</span>
                  <span className="cx-dot" style={{ "--hue": "#94a3b8" } as CSSProperties}>Opponent: {PLAYER_STATE[theirs ?? "waiting"]}</span>
                </div>
                {current.yourAttempt === null || resumable ? (
                  <Button asChild size="lg">
                    <Link href={`/arcade/wagers/${wager.id}/play`}>
                      <Play aria-hidden />
                      {resumable ? "Resume your puzzle" : `Play round ${current.round}`}
                    </Link>
                  </Button>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Hourglass aria-hidden className="size-4" />
                    You’ve played this round. Waiting for your opponent or the deadline.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {slots ? (
        <section aria-labelledby="m-rounds" className="space-y-3">
          <h2 id="m-rounds" className="cx-title">Rounds</h2>
          <ol className="cx-timeline">
            {Array.from({ length: slots }, (_, i) => {
              const round = wager.rounds.find((r) => r.round === i + 1);
              const planned = round ?? wager.games[i % wager.games.length];
              const state = slotState(round, wager);
              return (
                <li key={i} className="cx-slot" data-state={state} style={hue(planned.game)}>
                  <span className="cx-slot-num">{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{setupLabel(planned.game, planned.board)}</span>
                    <span className="block text-xs text-muted-foreground">
                      {round ? roundResult(round, wager) : "Upcoming"}
                    </span>
                  </span>
                  {round?.outcome ? (
                    <span className="text-right text-xs tabular-nums">
                      <span className={cn(round.outcome === "host" && "font-bold text-foreground")}>{round.hostScore === null ? "–" : formatScore(round.game, round.hostScore)}</span>
                      <span className="mx-1 text-muted-foreground">:</span>
                      <span className={cn(round.outcome === "opponent" && "font-bold text-foreground")}>{round.opponentScore === null ? "–" : formatScore(round.game, round.opponentScore)}</span>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">Scores read {host} : {opponent}. Your opponent’s score stays hidden until the round ends.</p>
        </section>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { toast } from "sonner";
import { BookOpen, Coins, Loader2, MessageSquareWarning, Play, RotateCcw, Swords, Trophy, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError, apiFetch } from "@/lib/api-client";
import {
  BOT_LEVELS,
  PLAYABLE,
  WHO_AM_I_RULES,
  botMove,
  cardById,
  cardTruth,
  characterById,
  type BotLevel,
  type Side,
  type WhoAmIEvent,
  type WhoAmIState,
} from "@/lib/who-am-i";
import { cn } from "@/lib/utils";
import { ShellNavProvider, type ShellNav } from "./competition";
import { GameShell, Stat, useArcade, useGameAchievementTracking } from "./game-shell";
import { Portrait } from "./who-am-i/portrait";
import { RulesList, WhoAmITable, knowledgeOf, mirrorEvents, type TableActions, type TableView } from "./who-am-i/table";

export type WhoAmIMode = { kind: "bot" } | { kind: "wager"; wager: string; initial: WhoAmIState; stake: number };

export default function GameWhoAmI({ mode }: { mode: WhoAmIMode }) {
  return mode.kind === "bot" ? <BotGame /> : <DuelGame wager={mode.wager} initial={mode.initial} stake={mode.stake} />;
}

const RULES_SEEN_KEY = "amethyst:who-am-i:rules-seen";
const BOT_RECORD_KEY = "amethyst:who-am-i:bot-record";
const BOT_NAME = "Prism";
/**
 * Fixed bot pacing: the same whatever it knows, so timing never gives anything away. Prism answers after a short
 * beat; its own turn only starts once the player has continued past that answer (see `hold`).
 */
const BOT_ANSWER_MS = 700;
const BOT_THINK_MS = 900;

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A convenience only.
  }
}

function RulesDialog({ open, onOpenChange, extra }: { open: boolean; onOpenChange: (open: boolean) => void; extra?: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How to play Who Am I?</DialogTitle>
          <DialogDescription>A deduction duel: work out the character on your own card.</DialogDescription>
        </DialogHeader>
        <RulesList rules={WHO_AM_I_RULES} />
        {extra}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Against the bot ---------------------------------------------------------------------------------

type BotGameState = {
  id: number;
  level: BotLevel;
  phase: "ask" | "answer" | "done";
  turn: Side;
  you: string;
  them: string;
  pending: TableView["pending"];
  events: WhoAmIEvent[];
  winner: Side | null;
  /** The player is reading the answer to their question (or their wrong guess); Prism waits for "Continue". */
  hold: boolean;
};

function withEvent(state: BotGameState, event: Pick<WhoAmIEvent, "by" | "kind"> & Partial<WhoAmIEvent>): WhoAmIEvent[] {
  return [
    ...state.events,
    { seq: state.events.length + 1, card: null, text: null, answer: null, guess: null, correct: null, auto: false, at: new Date().toISOString(), ...event },
  ];
}

function deal(id: number, level: BotLevel, first: Side | "random"): BotGameState {
  const you = PLAYABLE[Math.floor(Math.random() * PLAYABLE.length)];
  const others = PLAYABLE.filter((c) => c.id !== you.id);
  const them = others[Math.floor(Math.random() * others.length)];
  const turn = first === "random" ? (Math.random() < 0.5 ? "you" : "them") : first;
  const base: BotGameState = { id, level, phase: "ask", turn, you: you.id, them: them.id, pending: null, events: [], winner: null, hold: false };
  return { ...base, events: withEvent(base, { by: "system", kind: "start" }) };
}

/** The bot answers the player's card question truthfully, about the player's character. */
function botAnswers(g: BotGameState): BotGameState {
  if (g.phase !== "answer" || g.turn !== "you" || !g.pending?.card) return g;
  const card = cardById(g.pending.card);
  const you = characterById(g.you);
  if (!card || !you) return g;
  const events = withEvent(g, { by: "them", kind: "answer", card: card.id, answer: cardTruth(you, card) ? "yes" : "no" });
  return { ...g, events, phase: "ask", turn: "them", pending: null, hold: true };
}

/**
 * The bot's turn, from what it has legitimately learned: the player's answers to its cards, its own wrong
 * guesses and the player's visible character. Its own identity (`g.them`) is only read to check a guess.
 */
function botActs(g: BotGameState): BotGameState {
  if (g.phase !== "ask" || g.turn !== "them" || g.hold) return g;
  const move = botMove(knowledgeOf(mirrorEvents(g.events), g.you), g.level);
  if (move.kind === "ask") {
    return { ...g, events: withEvent(g, { by: "them", kind: "ask", card: move.card.id }), phase: "answer", pending: { kind: "card", card: move.card.id, text: null } };
  }
  const correct = move.character.id === g.them;
  const events = withEvent(g, { by: "them", kind: "guess", guess: move.character.id, correct });
  return correct ? { ...g, events, phase: "done", winner: "them" } : { ...g, events, turn: "you" };
}

function BotGame() {
  const { play } = useArcade();
  const [game, setGame] = useState<BotGameState | null>(null);
  const gameRef = useRef(game);
  const [level, setLevel] = useState<BotLevel>("normal");
  const [first, setFirst] = useState<Side | "random">("you");
  // The game only renders in the browser (no SSR), so storage can be read up front.
  const [record, setRecord] = useState(() => readStorage(BOT_RECORD_KEY, { wins: 0, losses: 0 }));
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rulesSeen, setRulesSeen] = useState(() => readStorage(RULES_SEEN_KEY, false));
  const counted = useRef(0);
  const nextId = useRef(1);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useGameAchievementTracking("who-am-i", game && game.phase !== "done" ? "playing" : "ready");

  // The bot's pace is fixed; the timers only ever advance the round they were set for.
  useEffect(() => {
    if (!game || game.phase === "done") return;
    if (game.phase === "answer" && game.turn === "you") {
      const timer = window.setTimeout(() => setGame((g) => (g && g.id === game.id ? botAnswers(g) : g)), BOT_ANSWER_MS);
      return () => window.clearTimeout(timer);
    }
    if (game.phase === "ask" && game.turn === "them" && !game.hold) {
      const timer = window.setTimeout(() => setGame((g) => (g && g.id === game.id ? botActs(g) : g)), BOT_THINK_MS);
      return () => window.clearTimeout(timer);
    }
  }, [game]);

  useEffect(() => {
    if (!game || game.phase !== "done" || counted.current === game.id) return;
    counted.current = game.id;
    play(game.winner === "you" ? "win" : "over");
    setRecord((current) => {
      const next = game.winner === "you" ? { ...current, wins: current.wins + 1 } : { ...current, losses: current.losses + 1 };
      writeStorage(BOT_RECORD_KEY, next);
      return next;
    });
  }, [game, play]);

  function start() {
    if (!rulesSeen) {
      setRulesSeen(true);
      writeStorage(RULES_SEEN_KEY, true);
    }
    const id = nextId.current++;
    setGame(deal(id, level, first));
    play("reveal");
  }

  const actions = useMemo<TableActions>(() => ({
    busy: false,
    ask: (question) => {
      if (!("card" in question)) return;
      setGame((g) =>
        g && g.phase === "ask" && g.turn === "you"
          ? { ...g, events: withEvent(g, { by: "you", kind: "ask", card: question.card }), phase: "answer", pending: { kind: "card", card: question.card, text: null } }
          : g,
      );
      play("waiAsk");
    },
    answer: (answer) => {
      const g = gameRef.current;
      if (!g || g.phase !== "answer" || g.turn !== "them" || !g.pending?.card) return;
      const card = cardById(g.pending.card);
      const them = characterById(g.them);
      if (!card || !them || answer === "unsure") return;
      if ((answer === "yes") !== cardTruth(them, card)) {
        play("invalid");
        toast.error(`Look again at ${them.name}: that answer doesn’t match their card.`);
        return;
      }
      play(answer === "yes" ? "waiYes" : "waiNo");
      setGame((current) =>
        current && current.id === g.id && current.phase === "answer" && current.turn === "them"
          ? { ...current, events: withEvent(current, { by: "you", kind: "answer", card: card.id, answer }), phase: "ask", turn: "you", pending: null }
          : current,
      );
    },
    guess: (id) => {
      const g = gameRef.current;
      if (!g || g.phase !== "ask" || g.turn !== "you") return;
      const correct = id === g.you;
      play(correct ? "win" : "waiWrong");
      setGame((current) => {
        if (!current || current.id !== g.id || current.phase !== "ask" || current.turn !== "you") return current;
        const events = withEvent(current, { by: "you", kind: "guess", guess: id, correct });
        return correct ? { ...current, events, phase: "done", winner: "you" } : { ...current, events, turn: "them", hold: true };
      });
    },
    acknowledge: () => setGame((current) => (current && current.hold ? { ...current, hold: false } : current)),
  }), [play]);

  const stats = (
    <>
      <Stat label="Wins" value={record.wins} highlight />
      <Stat label="Losses" value={record.losses} />
      {game ? <Stat label="Bot" value={BOT_LEVELS.find((l) => l.id === game.level)?.label} /> : null}
    </>
  );
  const shellActions = (
    <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => setRulesOpen(true)}>
      <BookOpen aria-hidden />
      Rules
    </Button>
  );

  return (
    <GameShell game="who-am-i" title="Who Am I?" active={Boolean(game && game.phase !== "done")} stats={stats} actions={shellActions} leaderboard={null}>
      {game ? (
        <WhoAmITable
          key={game.id}
          storageKey={`who-am-i:bot:${game.id}`}
          view={{
            phase: game.phase,
            turn: game.phase === "done" ? null : game.turn,
            names: { you: "You", them: BOT_NAME },
            identity: { you: game.phase === "done" ? game.you : null, them: game.them },
            pending: game.pending,
            events: game.events,
            winner: game.winner,
            reason: game.winner ? "guess" : null,
            customEnabled: false,
            deadline: null,
          }}
          actions={actions}
          banner={game.phase === "done" ? (
            <ResultBanner
              won={game.winner === "you"}
              title={game.winner === "you" ? "You worked it out!" : `${BOT_NAME} guessed first`}
              detail={`You were ${characterById(game.you)?.name}. ${BOT_NAME} was ${characterById(game.them)?.name}.`}
              you={game.you}
            >
              <Button onClick={start} autoFocus>
                <RotateCcw aria-hidden />
                Play again
              </Button>
              <Button variant="outline" onClick={() => setGame(null)}>Change setup</Button>
            </ResultBanner>
          ) : null}
        />
      ) : (
        <BotSetup level={level} onLevel={setLevel} first={first} onFirst={setFirst} onStart={start} showRules={!rulesSeen} />
      )}
      <RulesDialog open={rulesOpen} onOpenChange={setRulesOpen} />
    </GameShell>
  );
}

function Choice<T extends string>({ legend, value, options, onChange }: { legend: string; value: T; options: { id: T; label: string; hint?: string }[]; onChange: (value: T) => void }) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-xs font-semibold text-muted-foreground">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="grid gap-1.5 sm:grid-cols-3">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={value === option.id}
            onClick={() => onChange(option.id)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-sm outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring",
              value === option.id ? "border-amethyst bg-amethyst/15" : "border-border hover:border-amethyst/50",
            )}
          >
            <span className="block font-semibold">{option.label}</span>
            {option.hint ? <span className="block text-xs text-muted-foreground">{option.hint}</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function BotSetup({ level, onLevel, first, onFirst, onStart, showRules }: {
  level: BotLevel;
  onLevel: (level: BotLevel) => void;
  first: Side | "random";
  onFirst: (first: Side | "random") => void;
  onStart: () => void;
  showRules: boolean;
}) {
  const sample = PLAYABLE.slice(0, 6);
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <section className="grid gap-4 rounded-xl border border-border bg-surface/50 p-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
        <div className="space-y-2">
          <h2 className="text-xl font-bold">Who are you?</h2>
          <p className="text-sm text-muted-foreground text-pretty">
            You and {BOT_NAME} the bot each hold a secret Gemfolk card. You can see {BOT_NAME}’s, but not your own. Ask yes/no questions, cross people out and guess who you are before {BOT_NAME} does.
          </p>
        </div>
        <div aria-hidden className="grid grid-cols-3 gap-1">
          {sample.map((c) => <Portrait key={c.id} character={c} className="rounded-md" />)}
        </div>
      </section>
      <section aria-labelledby="wai-rules" className={cn("rounded-xl border p-4", showRules ? "border-amethyst/60 bg-amethyst/5" : "border-border bg-surface/40")}>
        <h2 id="wai-rules" className="mb-2 flex items-center gap-2 text-sm font-bold">
          <BookOpen aria-hidden className="size-4 text-amethyst" />
          {showRules ? "Before your first game" : "Rules"}
        </h2>
        <RulesList rules={WHO_AM_I_RULES} />
        <p className="mt-2 text-xs text-muted-foreground">
          {BOT_NAME} answers your questions truthfully and only uses what it has learned from your answers. Your answers to its cards are checked too.
        </p>
      </section>
      <section className="grid gap-4 rounded-xl border border-border bg-surface/40 p-4">
        <Choice legend="Bot" value={level} options={BOT_LEVELS} onChange={onLevel} />
        <Choice
          legend="Who starts"
          value={first}
          options={[{ id: "you", label: "You" }, { id: "them", label: BOT_NAME }, { id: "random", label: "Random" }]}
          onChange={onFirst}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onStart} autoFocus>
            <Play aria-hidden />
            Deal the cards
          </Button>
          <Link href="/arcade/wagers" className="inline-flex items-center gap-1 text-sm font-medium text-amethyst hover:underline">
            <Swords aria-hidden className="size-4" />
            Play a real rival in Wagers
          </Link>
        </div>
      </section>
    </div>
  );
}

const BURST_COLORS = ["#b384ff", "#34d399", "#4c8dff", "#ff4d6d", "#ffb63b"];
/** Gem shards for a win: fixed positions, so the banner renders the same every time. */
const BURST = Array.from({ length: 18 }, (_, i) => ({
  x: `${8 + ((i * 37) % 84)}%`,
  dx: `${((i * 53) % 140) - 70}px`,
  dy: `${-60 - ((i * 29) % 70)}px`,
  r: `${((i * 71) % 360) - 180}deg`,
  c: BURST_COLORS[i % BURST_COLORS.length],
  delay: `${(i % 6) * 40}ms`,
}));

function ResultBanner({ won, title, detail, you, children }: { won: boolean | null; title: string; detail: string; you: string | null; children?: ReactNode }) {
  const character = characterById(you);
  return (
    <section
      role="status"
      className={cn(
        "wai-result relative flex gap-3 overflow-hidden rounded-xl border p-3 sm:p-4",
        won === true && "wai-result-won border-emerald-400/70 bg-emerald-400/10",
        won === false && "wai-result-lost border-rose-400/60 bg-rose-400/10",
        won === null && "border-border bg-surface/50",
      )}
    >
      {won ? (
        <span aria-hidden className="wai-burst">
          {BURST.map((shard, i) => (
            <span key={i} style={{ "--x": shard.x, "--dx": shard.dx, "--dy": shard.dy, "--r": shard.r, "--c": shard.c, animationDelay: shard.delay } as CSSProperties} />
          ))}
        </span>
      ) : null}
      {character ? (
        <span className={cn("wai-flip-in relative size-20 shrink-0 overflow-hidden rounded-lg ring-2 ring-offset-2 ring-offset-background sm:size-24", won ? "ring-emerald-400" : won === false ? "ring-rose-400" : "ring-border")}>
          <Portrait character={character} />
        </span>
      ) : null}
      <div className="relative min-w-0 space-y-2">
        <p className="flex items-center gap-2 text-xl font-black tracking-tight">
          {won === true ? <Trophy aria-hidden className="size-5 text-emerald-300" /> : won === false ? <X aria-hidden className="size-5 text-rose-300" strokeWidth={3} /> : null}
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{detail}</p>
        {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
      </div>
    </section>
  );
}

// --- Wager duel ---------------------------------------------------------------------------------------

const REASON_TEXT = (state: WhoAmIState) => {
  const winner = state.winner === "you" ? "You" : state.names.them;
  const loser = state.winner === "you" ? state.names.them : "You";
  switch (state.reason) {
    case "guess":
      return `${winner} guessed right.`;
    case "timeout":
      return `${loser} missed two moves in a row, so ${winner === "You" ? "you win" : `${winner} wins`} the round.`;
    case "no_show":
      return `${loser === "You" ? "You" : loser} didn’t join before the deadline.`;
    case "turn_limit":
      return "80 turns passed without a correct guess, so the round is a tie and doesn’t count.";
    default:
      return "";
  }
};

function DuelGame({ wager, initial, stake }: { wager: string; initial: WhoAmIState; stake: number }) {
  const { play } = useArcade();
  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  // Server clock minus local clock, so move deadlines count down correctly on any device.
  const [offset, setOffset] = useState(() => Date.parse(initial.now) - Date.now());
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const url = `/api/competitive/wagers/${wager}/who-am-i`;
  const round = initial.round;
  const over = state.phase === "done" || state.roundOutcome !== null || state.wagerStatus !== "active";

  useGameAchievementTracking("who-am-i", state.phase === "ask" || state.phase === "answer" ? "playing" : "ready");

  /** Newer state only: a slow poll never rolls back a move that already landed. */
  const accept = useCallback((next: WhoAmIState) => {
    const current = stateRef.current;
    if (next.seq < current.seq) return;
    setOffset(Date.parse(next.now) - Date.now());
    stateRef.current = next;
    setState(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      accept(await apiFetch<WhoAmIState>(`${url}?round=${round}`));
      setStale(false);
    } catch {
      setStale(true);
    }
  }, [accept, url, round]);

  useEffect(() => {
    if (over) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, stateRef.current.phase === "lobby" ? 3000 : 1500);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [over, refresh, state.phase]);

  const send = useCallback(
    async (body: Record<string, unknown>, move: boolean) => {
      setBusy(true);
      // One request id per move: a retry after a dropped connection can't act twice.
      const payload = { round, ...body, ...(move ? { request: crypto.randomUUID(), seq: stateRef.current.seq } : {}) };
      try {
        for (let attempt = 0; ; attempt++) {
          try {
            accept(await apiFetch<WhoAmIState>(url, { method: "POST", json: payload }));
            return true;
          } catch (error) {
            if (error instanceof ApiError && error.code === "network_error" && attempt === 0) continue;
            throw error;
          }
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === "whoami_wrong_answer") play("invalid");
        toast.error(error instanceof ApiError ? error.message : "That move couldn’t be made.");
        void refresh();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accept, play, refresh, round, url],
  );

  const actions = useMemo<TableActions>(() => ({
    busy,
    ask: (question) => {
      play("waiAsk");
      void send({ action: "ask", ...question }, true);
    },
    answer: (answer) => void send({ action: "answer", answer }, true),
    guess: (guess) => void send({ action: "guess", guess }, true),
  }), [busy, play, send]);

  const consent = (custom: boolean) => send({ action: "consent", custom }, false);
  // The frame's back button leads to the match, and a floating return button appears once the round is over.
  const nav: ShellNav = { back: { href: `/arcade/wagers/${wager}`, label: "Back to the match", short: "Match" }, banner: null, done: state.phase === "done" };
  const stats = (
    <>
      <Stat label="Round" value={round} />
      <Stat label="Pot" value={<span className="inline-flex items-center gap-1"><Coins aria-hidden className="size-4" />{(stake * 2).toLocaleString("en")}</span>} />
      {state.phase === "ask" || state.phase === "answer" ? <Stat label="Turn" value={state.turn === "you" ? "Yours" : "Theirs"} highlight={state.turn === "you"} /> : null}
    </>
  );
  const shellActions = (
    <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={() => setRulesOpen(true)}>
      <BookOpen aria-hidden />
      Rules
    </Button>
  );

  const started = state.phase !== "lobby";
  return (
    <ShellNavProvider value={nav}>
    <GameShell game="who-am-i" title="Who Am I? · Wager" active={state.phase === "ask" || state.phase === "answer"} stats={stats} actions={shellActions} leaderboard={null}>
      {stale ? <p role="status" className="mb-2 text-center text-xs text-amber-400">Connection lost. Reconnecting…</p> : null}
      {!started ? (
        <Lobby state={state} busy={busy} over={over} wager={wager} onJoin={() => void send({ action: "join" }, false)} onConsent={consent} />
      ) : (
        <WhoAmITable
          storageKey={`who-am-i:wager:${wager}:${round}`}
          view={{
            phase: state.phase === "lobby" ? "ask" : state.phase,
            turn: state.turn,
            names: state.names,
            identity: state.identity,
            pending: state.pending,
            events: state.events,
            winner: state.winner,
            reason: state.reason,
            customEnabled: state.custom.enabled,
            deadline: state.deadline ? Date.parse(state.deadline) - offset : null,
          }}
          actions={actions}
          banner={
            state.phase === "done" ? (
              <ResultBanner
                won={state.winner === "you" ? true : state.winner === "them" ? false : null}
                title={state.winner === "you" ? "You won the round!" : state.winner === "them" ? `${state.names.them} won the round` : "Round tied"}
                detail={`${REASON_TEXT(state)} You were ${characterById(state.identity.you)?.name ?? "?"}; ${state.names.them} was ${characterById(state.identity.them)?.name ?? "?"}.`}
                you={state.identity.you}
              >
                <Button asChild autoFocus>
                  <Link href={`/arcade/wagers/${wager}`}>
                    <Swords aria-hidden />
                    Back to the match
                  </Link>
                </Button>
              </ResultBanner>
            ) : state.strikes.you > 0 ? (
              <p role="alert" className="rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm">
                You missed a move. Miss another in a row and you lose this round.
              </p>
            ) : null
          }
          footer={state.phase !== "done" ? <ConsentPanel state={state} busy={busy} onConsent={consent} compact /> : null}
        />
      )}
      <RulesDialog
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        extra={<p className="text-sm text-muted-foreground">In a Wager each move has 2 minutes. A missed card answer is answered for you; missing two moves in a row loses the round.</p>}
      />
    </GameShell>
    </ShellNavProvider>
  );
}

function Lobby({ state, busy, over, wager, onJoin, onConsent }: {
  state: WhoAmIState;
  busy: boolean;
  over: boolean;
  wager: string;
  onJoin: () => void;
  onConsent: (custom: boolean) => void;
}) {
  const due = new Date(state.roundDeadline).toLocaleString("en", { timeZone: "UTC", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false });
  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <section className="grid gap-3 rounded-xl border border-amethyst/50 bg-amethyst/5 p-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users aria-hidden className="size-5 text-amethyst" />
          Round {state.round}: you vs {state.names.them}
        </h2>
        <RulesList rules={WHO_AM_I_RULES} />
        <p className="text-xs text-muted-foreground">
          The round starts once you’re both here; the server picks who goes first. Each move has 2 minutes. A card you don’t answer in time is answered for you; missing two moves in a row loses the round.
        </p>
        {over ? (
          <div role="status" className="space-y-2">
            <p className="text-sm font-semibold">{state.roundOutcome === "void" ? "Nobody joined in time, so this round is void." : "This round is over."}</p>
            <Button asChild>
              <Link href={`/arcade/wagers/${wager}`}>Back to the match</Link>
            </Button>
          </div>
        ) : state.joined.you ? (
          <p role="status" className="flex items-center gap-2 text-sm">
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            You’re in. Waiting for {state.names.them} to join (until {due} UTC). Keep this page open.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={onJoin} disabled={busy} autoFocus>
              {busy ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Play aria-hidden />}
              I’m ready
            </Button>
            <span className="text-sm text-muted-foreground">{state.joined.them ? `${state.names.them} is already waiting.` : `Join by ${due} UTC.`}</span>
          </div>
        )}
      </section>
      {!over ? <ConsentPanel state={state} busy={busy} onConsent={onConsent} /> : null}
    </div>
  );
}

/** Custom questions: off unless both players opt in, with the limits spelled out first. */
function ConsentPanel({ state, busy, onConsent, compact = false }: { state: WhoAmIState; busy: boolean; onConsent: (custom: boolean) => void; compact?: boolean }) {
  const [understood, setUnderstood] = useState(false);
  const label = (value: boolean | null) => (value === null ? "Not decided" : value ? "Opted in" : "Cards only");
  const body = (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground text-pretty">
        Question cards are the default: their answers are checked against the character, so nobody can answer them wrongly. Custom questions let you type your own yes/no question, but <strong className="text-foreground">answers to them are reported by your opponent and can’t be verified</strong>. A dishonest answer could change who wins the round and the pot. It is not cheat-proof; only opt in with someone you trust.
      </p>
      <dl className="flex flex-wrap gap-2 text-xs">
        <div className="rounded-full border border-border px-2.5 py-1"><dt className="inline font-semibold">You: </dt><dd className="inline">{label(state.custom.you)}</dd></div>
        <div className="rounded-full border border-border px-2.5 py-1"><dt className="inline font-semibold">{state.names.them}: </dt><dd className="inline">{label(state.custom.them)}</dd></div>
        <div className={cn("rounded-full px-2.5 py-1 font-semibold", state.custom.enabled ? "bg-amber-400/20 text-amber-300" : "bg-foreground/10")}>
          {state.custom.enabled ? "Custom questions on" : "Cards only"}
        </div>
      </dl>
      {state.custom.you ? (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={() => onConsent(false)} disabled={busy}>
          Switch back to cards only
        </Button>
      ) : (
        <div className="grid gap-2">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={understood} onCheckedChange={(value) => setUnderstood(value === true)} className="mt-0.5" />
            <span>I understand custom answers are self-reported and can’t be checked.</span>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onConsent(true)} disabled={!understood || busy}>
              Allow custom questions
            </Button>
            {state.custom.you === null ? (
              <Button size="sm" variant="ghost" onClick={() => onConsent(false)} disabled={busy}>
                Keep cards only
              </Button>
            ) : null}
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Either player can switch back to cards only at any time, for this match’s remaining Who Am I? rounds.</p>
    </div>
  );
  if (compact) {
    return (
      <details className="rounded-xl border border-border bg-surface/40 p-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <MessageSquareWarning aria-hidden className="size-4 text-amber-400" />
          Custom questions: {state.custom.enabled ? "on" : "off"}
        </summary>
        <div className="mt-3">{body}</div>
      </details>
    );
  }
  return (
    <section aria-labelledby="wai-custom-consent" className="rounded-xl border border-border bg-surface/40 p-4">
      <h2 id="wai-custom-consent" className="mb-2 flex items-center gap-2 text-sm font-bold">
        <MessageSquareWarning aria-hidden className="size-4 text-amber-400" />
        Optional: custom questions
      </h2>
      {body}
    </section>
  );
}


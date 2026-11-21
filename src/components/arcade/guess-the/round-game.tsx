"use client";

import "./guess-the.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Flag, Info, LayoutGrid, Loader2, RotateCcw, Ruler, Tag, Trophy, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ROUND_SCORING, ROUND_SIZE, roundVerdict, type RoundModeId, type RoundPrompt, type RoundResult } from "@/lib/minigames/guess-the";
import { cn } from "@/lib/utils";
import { GameShell, useArcade, useGameAchievementTracking } from "../game-shell";
import { Confetti, CountUp, toneOf } from "./fx";

/**
 * The shared player for round-based Guess The ... modes: deals a round from /api/arcade/guess-the/<mode>, shows one
 * prompt at a time through the mode's own view, reveals each answer straight after its guess, then has the server
 * re-score the whole round and save the record. A mode only provides its prompt view and a one-line summary.
 */

export type PlayProps<M extends RoundModeId> = {
  prompt: RoundPrompt[M];
  result: RoundResult[M] | null;
  /** The guess the player made, once revealed. */
  guess: unknown;
  busy: boolean;
  onGuess: (guess: RoundGuess<M>) => void;
  animate: boolean;
};
export type RoundGuess<M extends RoundModeId> = M extends "flag" ? string : number;

type Phase<M extends RoundModeId> =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "playing"; prompts: RoundPrompt[M][]; index: number; results: (RoundResult[M] | null)[]; guesses: unknown[]; busy: boolean }
  | { kind: "finishing"; prompts: RoundPrompt[M][]; results: RoundResult[M][]; guesses: unknown[] }
  | { kind: "done"; prompts: RoundPrompt[M][]; results: RoundResult[M][]; guesses: unknown[]; score: number; best: number; previousBest: number | null };

const MODE_ICON = { flag: Flag, size: Ruler, price: Tag } as const;

const RECENT_KEEP = 30;
const recentKey = (mode: RoundModeId) => `amethyst:guess-the:${mode}:recent:v1`;
function readRecent(mode: RoundModeId): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(recentKey(mode)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string").slice(-RECENT_KEEP) : [];
  } catch {
    return [];
  }
}
function rememberRound(mode: RoundModeId, ids: readonly string[]) {
  try {
    const next = [...readRecent(mode).filter((id) => !ids.includes(id)), ...ids].slice(-RECENT_KEEP);
    window.localStorage.setItem(recentKey(mode), JSON.stringify(next));
  } catch {
    // Without storage, rounds are still dealt at random.
  }
}

/** A prompt's score as a share of the best it could be (flags are worth 10). */
const shareOf = (mode: RoundModeId, score: number) => (mode === "flag" ? score * 10 : score);

export function ScoreRing({ score, animate, size = "lg" }: { score: number; animate: boolean; size?: "lg" | "xl" }) {
  const r = 34;
  const length = 2 * Math.PI * r;
  return (
    <div className={cn("relative grid shrink-0 place-items-center", size === "xl" ? "size-36 sm:size-40" : "size-24")}>
      <svg viewBox="0 0 84 84" className="absolute inset-0 size-full -rotate-90 drop-shadow-[0_0_18px_rgb(var(--gt-a-rgb)/0.45)]" aria-hidden>
        <circle cx="42" cy="42" r={r} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="7" className="text-foreground" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="url(#gtr-ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - score / 100)}
          className={cn(animate && "gtc-ring")}
          style={{ "--gtc-ring-from": length } as CSSProperties}
        />
        <defs>
          <linearGradient id="gtr-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--gt-a)" />
            <stop offset="100%" stopColor="var(--gt-b)" />
          </linearGradient>
        </defs>
      </svg>
      <p className="relative flex flex-col items-center leading-none">
        <span className={cn("font-extrabold tabular-nums", size === "xl" ? "gt-display text-5xl" : "text-3xl")}>
          <CountUp value={score} animate={animate} />
        </span>
        <span className="mt-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">of 100</span>
      </p>
    </div>
  );
}

export function RoundGame<M extends RoundModeId>({
  mode,
  title,
  best: initialBest,
  noun,
  howTo,
  Play,
  summary,
}: {
  mode: M;
  title: string;
  best: number | null;
  /** One prompt, in the singular ("flag", "comparison", "price"). */
  noun: string;
  /** How to play, shown under the prompt. */
  howTo: ReactNode;
  Play: ComponentType<PlayProps<M>>;
  /** One line per prompt in the round summary. */
  summary: (prompt: RoundPrompt[M], result: RoundResult[M], guess: unknown) => ReactNode;
}) {
  const { play, effects } = useArcade();
  const [phase, setPhase] = useState<Phase<M>>({ kind: "loading" });
  const [best, setBest] = useState<number | null>(initialBest);
  const [rounds, setRounds] = useState(0);
  const loading = useRef(false);
  const size = ROUND_SIZE[mode];
  const animate = effects !== "off";
  const Icon: LucideIcon = MODE_ICON[mode];

  useGameAchievementTracking("guess-the", phase.kind === "playing" ? "playing" : phase.kind);

  const deal = useCallback(() => {
    if (loading.current) return;
    loading.current = true;
    setPhase({ kind: "loading" });
    apiFetch<{ prompts: RoundPrompt[M][] }>(`/api/arcade/guess-the/${mode}?recent=${encodeURIComponent(readRecent(mode).join(","))}`)
      .then(
        ({ prompts }) => {
          rememberRound(
            mode,
            prompts.map((prompt) => prompt.id),
          );
          setPhase({ kind: "playing", prompts, index: 0, results: prompts.map(() => null), guesses: prompts.map(() => null), busy: false });
        },
        () => setPhase({ kind: "error", message: "Couldn’t load a round. Check your connection and try again." }),
      )
      .finally(() => (loading.current = false));
  }, [mode]);

  useEffect(() => {
    // The first round is dealt in the browser, where the list of recently played prompts lives.
    const id = window.setTimeout(deal, 0);
    return () => window.clearTimeout(id);
  }, [deal]);

  async function guess(value: RoundGuess<M>) {
    if (phase.kind !== "playing" || phase.busy || phase.results[phase.index]) return;
    const current = phase;
    const prompt = current.prompts[current.index];
    setPhase({ ...current, busy: true });
    play("tap");
    try {
      const { result } = await apiFetch<{ result: RoundResult[M] }>(`/api/arcade/guess-the/${mode}`, { method: "POST", json: { action: "reveal", id: prompt.id, guess: value } });
      const results = current.results.map((entry, i) => (i === current.index ? result : entry));
      const guesses = current.guesses.map((entry, i) => (i === current.index ? value : entry));
      setPhase({ ...current, results, guesses, busy: false });
      const share = shareOf(mode, result.score);
      play(share >= 90 ? "perfect" : share >= 50 ? "coin" : "miss");
    } catch (error) {
      setPhase({ ...current, busy: false });
      toast.error(error instanceof ApiError ? error.message : "Couldn’t check your guess. Try again.");
    }
  }

  async function finish() {
    if (phase.kind !== "playing" || phase.results.some((result) => !result)) return;
    const { prompts, guesses } = phase;
    const results = phase.results as RoundResult[M][];
    setPhase({ kind: "finishing", prompts, results, guesses });
    try {
      const body = await apiFetch<{ score: number; best: number }>(`/api/arcade/guess-the/${mode}`, {
        method: "POST",
        json: { action: "finish", answers: prompts.map((prompt, i) => ({ id: prompt.id, guess: guesses[i] })) },
      });
      setPhase({ kind: "done", prompts, results, guesses, score: body.score, best: body.best, previousBest: best });
      setBest(body.best);
      setRounds((count) => count + 1);
      play(body.score >= 75 ? "win" : "reveal");
    } catch (error) {
      setPhase({ kind: "playing", prompts, index: prompts.length - 1, results, guesses, busy: false });
      toast.error(error instanceof ApiError ? error.message : "Couldn’t save your round. Try again.");
    }
  }

  function next() {
    if (phase.kind !== "playing") return;
    if (phase.index === phase.prompts.length - 1) return void finish();
    setPhase({ ...phase, index: phase.index + 1 });
  }

  const results: (RoundResult[M] | null)[] = phase.kind === "playing" ? phase.results : phase.kind === "finishing" || phase.kind === "done" ? phase.results : [];
  const scored = results.filter(Boolean) as RoundResult[M][];
  const running = scored.length ? (mode === "flag" ? scored.reduce((sum, result) => sum + result.score, 0) : Math.round(scored.reduce((sum, result) => sum + result.score, 0) / scored.length)) : 0;
  const current = phase.kind === "playing" ? phase.index : -1;
  const newBest = phase.kind === "done" && (phase.previousBest === null || phase.score > phase.previousBest);

  return (
    <GameShell
      game="guess-the"
      title={title}
      active={phase.kind === "playing" && scored.length > 0}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
          <Link href="/arcade/guess-the" title="All Guess The ... modes">
            <LayoutGrid aria-hidden />
            <span className="hidden sm:inline">Modes</span>
          </Link>
        </Button>
      }
    >
      <div data-motion={effects} data-gt-mode={mode} className="relative flex flex-col gap-4">
        <div className="gt-hud">
          <span className="gt-mode-badge">
            <span aria-hidden>
              <Icon className="size-4" />
            </span>
            {title}
          </span>
          <ol className="gt-pips order-last w-full sm:order-none sm:w-auto" aria-label={`${scored.length} of ${size} answered`}>
            {Array.from({ length: size }, (_, i) => {
              const result = results[i];
              const state = result ? toneOf(shareOf(mode, result.score)) : i === current ? "current" : "todo";
              return <li key={i} className="gt-pip" data-state={state} />;
            })}
          </ol>
          <div className="ml-auto flex gap-5">
            <p className="gt-stat">
              <b>{running}</b>
              <span>{mode === "flag" ? "Points" : "Average"}</span>
            </p>
            <p className="gt-stat">
              <b className="text-muted-foreground">{best ?? "—"}</b>
              <span>Best</span>
            </p>
          </div>
        </div>

        {phase.kind === "loading" ? (
          <div role="status" className="gt-card grid min-h-[26rem] place-items-center text-sm text-muted-foreground">
            <span className="flex flex-col items-center gap-4">
              <span aria-hidden className="gtc-loader" />
              Dealing a fresh round…
            </span>
          </div>
        ) : phase.kind === "error" ? (
          <div role="alert" className="gt-card grid min-h-[26rem] place-items-center gap-3 text-center text-sm">
            <p>{phase.message}</p>
            <Button size="lg" className="gt-go" onClick={deal}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          </div>
        ) : phase.kind === "playing" ? (
          <>
            <div key={phase.prompts[phase.index].id} className="gt-enter">
              <p className="gt-kicker mb-2 px-1">
                {noun} {phase.index + 1} / {phase.prompts.length}
              </p>
              <Play
                prompt={phase.prompts[phase.index]}
                result={phase.results[phase.index]}
                guess={phase.guesses[phase.index]}
                busy={phase.busy}
                onGuess={(value) => void guess(value)}
                animate={animate}
              />
            </div>
            {phase.results[phase.index] ? (
              <div className="gt-enter-2 flex justify-end">
                <Button size="lg" className="gt-go h-12 rounded-full px-6 text-base" onClick={next} ref={(element) => element?.focus({ preventScroll: true })}>
                  {phase.index === phase.prompts.length - 1 ? "See your score" : `Next ${noun}`}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            ) : null}
            <details className="gt-card p-3 text-xs text-muted-foreground" open={rounds === 0 && phase.index === 0 && !phase.results[0]}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-foreground">
                <Info aria-hidden className="size-3.5 text-[var(--gt-a)]" />
                How to play and scoring
              </summary>
              <div className="mt-2 flex flex-col gap-2 text-pretty">
                {howTo}
                <p>{ROUND_SCORING[mode]}</p>
              </div>
            </details>
          </>
        ) : phase.kind === "finishing" ? (
          <div role="status" className="gt-card grid min-h-[20rem] place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Adding up your round…
            </span>
          </div>
        ) : (
          <>
            <section aria-live="polite" className="gt-card gt-card-hero gt-enter relative flex flex-col items-center gap-5 overflow-hidden p-6 text-center sm:flex-row sm:p-8 sm:text-left">
              {newBest || phase.score === 100 ? <Confetti /> : null}
              <ScoreRing score={phase.score} animate={animate} size="xl" />
              <div className="flex min-w-0 flex-1 flex-col items-center gap-2 sm:items-start">
                <p className="gt-kicker">Round complete</p>
                <p className="gt-display text-4xl sm:text-5xl">
                  <span className="gt-gradient-text">{roundVerdict(phase.score)}</span>
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  {newBest ? <span className="gtc-chip-rose gtc-chip">New best!</span> : null}
                  <span className="gt-chip">
                    <Trophy aria-hidden className="size-3" />
                    Best {phase.best}/100
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <Button size="lg" className="gt-go h-12 rounded-full px-6 text-base" onClick={deal} ref={(element) => element?.focus({ preventScroll: true })}>
                  <RotateCcw aria-hidden />
                  Play again
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/arcade/guess-the">Try another mode</Link>
                </Button>
              </div>
            </section>
            <ol className="grid gap-2 sm:grid-cols-2">
              {phase.prompts.map((prompt, i) => {
                const result = phase.results[i];
                const share = shareOf(mode, result.score);
                return (
                  <li key={prompt.id} className="gt-card gt-enter-2 flex flex-col gap-2 p-3" style={{ animationDelay: `${0.1 + i * 0.05}s` }}>
                    <div className="flex items-start gap-3">
                      <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[rgb(var(--ink-rgb)/0.08)] text-xs font-bold tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1 text-sm">{summary(prompt, result, phase.guesses[i])}</div>
                      <span data-tone={toneOf(share)} className="shrink-0 text-lg font-extrabold text-[var(--tone)] tabular-nums">
                        {result.score}
                        <span className="text-xs font-normal text-muted-foreground">/{mode === "flag" ? 10 : 100}</span>
                      </span>
                    </div>
                    <div aria-hidden className="gtc-progress">
                      <span data-tone={toneOf(share)} style={{ width: `${share}%`, background: "var(--tone)", boxShadow: "0 0 10px var(--tone)" }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </div>
    </GameShell>
  );
}

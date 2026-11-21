"use client";

import "./guess-the.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Info, LayoutGrid, Loader2, RotateCcw, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { ROUND_SCORING, ROUND_SIZE, roundVerdict, type RoundModeId, type RoundPrompt, type RoundResult } from "@/lib/minigames/guess-the";
import { cn } from "@/lib/utils";
import { GameShell, Stat, useArcade, useGameAchievementTracking } from "../game-shell";

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

function ScoreRing({ score, animate }: { score: number; animate: boolean }) {
  const r = 34;
  const length = 2 * Math.PI * r;
  return (
    <div className="relative grid size-24 shrink-0 place-items-center">
      <svg viewBox="0 0 84 84" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="42" cy="42" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="7" className="text-foreground" />
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
            <stop offset="0%" stopColor="var(--amethyst)" />
            <stop offset="100%" stopColor="var(--rose)" />
          </linearGradient>
        </defs>
      </svg>
      <p className="relative flex flex-col items-center leading-none">
        <span className="text-3xl font-extrabold tabular-nums">{score}</span>
        <span className="mt-0.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">of 100</span>
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
        () => setPhase({ kind: "error", message: `Couldn’t load a round. Check your connection and try again.` }),
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
      play(result.score >= (mode === "flag" ? 1 : 75) ? "win" : "reveal");
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

  const answered = phase.kind === "playing" ? phase.results.filter(Boolean).length : phase.kind === "finishing" || phase.kind === "done" ? size : 0;
  const scored = phase.kind === "playing" ? (phase.results.filter(Boolean) as RoundResult[M][]) : phase.kind === "finishing" || phase.kind === "done" ? phase.results : [];
  const running = scored.length ? (mode === "flag" ? scored.reduce((sum, result) => sum + result.score, 0) : Math.round(scored.reduce((sum, result) => sum + result.score, 0) / scored.length)) : null;

  return (
    <GameShell
      game="guess-the"
      title={title}
      active={phase.kind === "playing" && answered > 0}
      actions={
        <Button asChild variant="outline" size="sm" className="h-8 px-2.5">
          <Link href="/arcade/guess-the" title="All Guess The ... modes">
            <LayoutGrid aria-hidden />
            <span className="hidden sm:inline">Modes</span>
          </Link>
        </Button>
      }
      stats={
        <>
          <Stat label="Best" value={best === null ? "—" : `${best}/100`} />
          <Stat label="This round" value={`${answered}/${size}`} />
          <Stat label={mode === "flag" ? "Points" : "Average"} value={running ?? "—"} />
        </>
      }
    >
      <div data-motion={effects} className="flex flex-col gap-3">
        {phase.kind === "loading" ? (
          <div role="status" className="gtc-panel grid min-h-[24rem] place-items-center text-sm text-muted-foreground">
            <span className="flex flex-col items-center gap-3">
              <span aria-hidden className="gtc-loader" />
              Dealing a round…
            </span>
          </div>
        ) : phase.kind === "error" ? (
          <div role="alert" className="gtc-panel grid min-h-[24rem] place-items-center gap-3 text-center text-sm">
            <p>{phase.message}</p>
            <Button size="sm" onClick={deal}>
              <RotateCcw aria-hidden />
              Try again
            </Button>
          </div>
        ) : phase.kind === "playing" ? (
          <>
            <div className="flex items-center gap-3">
              <p className="shrink-0 text-xs font-semibold text-muted-foreground tabular-nums">
                {noun[0].toUpperCase() + noun.slice(1)} {phase.index + 1} of {phase.prompts.length}
              </p>
              <div aria-hidden className="gtc-progress flex-1">
                <span style={{ width: `${(answered / phase.prompts.length) * 100}%` }} />
              </div>
            </div>
            <Play
              key={phase.prompts[phase.index].id}
              prompt={phase.prompts[phase.index]}
              result={phase.results[phase.index]}
              guess={phase.guesses[phase.index]}
              busy={phase.busy}
              onGuess={(value) => void guess(value)}
              animate={animate}
            />
            {phase.results[phase.index] ? (
              <div className="flex justify-end">
                <Button size="lg" onClick={next} ref={(element) => element?.focus({ preventScroll: true })}>
                  {phase.index === phase.prompts.length - 1 ? "See your round" : `Next ${noun}`}
                  <ArrowRight aria-hidden />
                </Button>
              </div>
            ) : null}
            <details className="gtc-panel p-3 text-xs text-muted-foreground" open={rounds === 0 && phase.index === 0 && !phase.results[0]}>
              <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-foreground">
                <Info aria-hidden className="size-3.5 text-amethyst" />
                How to play and scoring
              </summary>
              <div className="mt-2 flex flex-col gap-2 text-pretty">
                {howTo}
                <p>{ROUND_SCORING[mode]}</p>
              </div>
            </details>
          </>
        ) : phase.kind === "finishing" ? (
          <div role="status" className="gtc-panel grid min-h-[16rem] place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              Scoring your round…
            </span>
          </div>
        ) : (
          <>
            <section aria-live="polite" className="gtc-panel gtc-score flex flex-col items-center gap-4 p-4 text-center sm:flex-row sm:text-left">
              <ScoreRing score={phase.score} animate={animate} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center justify-center gap-2 text-lg font-extrabold tracking-tight sm:justify-start">
                  {roundVerdict(phase.score)}
                  {phase.previousBest === null || phase.score > phase.previousBest ? <span className="gtc-chip gtc-chip-rose">New best</span> : null}
                </p>
                <p className="mt-0.5 flex items-center justify-center gap-1.5 text-sm text-muted-foreground sm:justify-start">
                  <Trophy aria-hidden className="size-3.5" />
                  Best round: <span className="font-semibold text-foreground tabular-nums">{phase.best}/100</span>
                </p>
              </div>
              <Button size="lg" onClick={deal} ref={(element) => element?.focus({ preventScroll: true })}>
                <RotateCcw aria-hidden />
                Play another round
              </Button>
            </section>
            <ol className="gtc-panel flex flex-col divide-y divide-border p-1 text-sm">
              {phase.prompts.map((prompt, i) => (
                <li key={prompt.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-5 shrink-0 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">{summary(prompt, phase.results[i], phase.guesses[i])}</div>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {phase.results[i].score}
                    <span className="text-xs font-normal text-muted-foreground">/{mode === "flag" ? 10 : 100}</span>
                  </span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </GameShell>
  );
}

"use client";

import "./blank-atlas/descent.css";
import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { ArrowDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BLANK_ATLAS_GAME,
  DIVES,
  MAX_SCORE,
  STOPS,
  TIERS,
  diveOf,
  judge,
  newRound,
  questionById,
  restoreRound,
  roundScore,
  type Dive,
  type Round,
  type Stop,
} from "@/lib/minigames/blank-atlas";
import { DescentShaft, DIVE_COLOR, depthOf, fathoms } from "./blank-atlas/descent-shaft";
import { GameShell, Stat, useArcade, useGameAchievementTracking, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

// Storage keys keep the game's original id, so a round in progress survives the retheme.
const SAVE_KEY = "amethyst:blank-atlas:round:v1";
const RECENT_KEY = "amethyst:blank-atlas:recent:v1";
const SOUND: Record<Dive, SoundName> = { familiar: "place", uncommon: "chip", rare: "reveal", exceptional: "unlock", extraordinary: "perfect" };
const DIVE_ORDER: Dive[] = ["familiar", "uncommon", "rare", "exceptional", "extraordinary"];

function read<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows can refuse storage; the round still plays, it just won't survive a reload.
  }
}

const tone = (dive: Dive | null) => ({ "--dv": dive ? DIVE_COLOR[dive] : "#8a8f98" }) as CSSProperties;

/** The Descent: seven questions, seven dives into the fog. Rarer correct answers score more and dive harder. */
export default function DescentGame({ records }: { records: Record<string, number> }) {
  const { play } = useArcade();
  const { best, submit } = useRecord(BLANK_ATLAS_GAME, records[""] ?? null);
  // The game only renders in the browser (see lazy.tsx), so the saved round can be read right away.
  const [round, setRound] = useState<Round>(() => restoreRound(read(SAVE_KEY)) ?? newRound(read<string[]>(RECENT_KEY) ?? []));
  const [input, setInput] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  /** The dive made in this visit that should animate (null after a reload, so restored dives sit still). */
  const [fresh, setFresh] = useState<number | null>(null);
  const [newBest, setNewBest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = round.stops.length;
  const done = index >= STOPS;
  const question = done ? null : questionById(round.questions[index]);
  const score = roundScore(round);
  const last = round.stops.at(-1) ?? null;
  const lastDive = last ? diveOf(last.question, last.answer, last.tier) : null;
  useGameAchievementTracking(BLANK_ATLAS_GAME, done ? "over" : "playing");

  useEffect(() => write(SAVE_KEY, round), [round]);
  useEffect(() => {
    if (!done) inputRef.current?.focus({ preventScroll: true });
  }, [index, done]);

  function dive(stop: Stop) {
    const next: Round = { ...round, stops: [...round.stops, stop] };
    setRound(next);
    setInput("");
    setWarning(null);
    setFresh(next.stops.length - 1);
    if (next.stops.length >= STOPS) {
      window.setTimeout(() => play("win"), 700);
      write(RECENT_KEY, next.questions);
      setNewBest(submit(roundScore(next)));
    }
  }

  function answer(event: FormEvent) {
    event.preventDefault();
    if (!question) return;
    const verdict = judge(question, input);
    if (verdict.kind === "empty") {
      play("invalid");
      setWarning("Type an answer first, or let this one pass.");
      return;
    }
    if (verdict.kind === "miss") {
      play("invalid");
      setWarning(verdict.reason ?? `“${input.trim()}” isn’t a correct answer here. Nothing is lost; try another.`);
      inputRef.current?.select();
      return;
    }
    if (verdict.kind === "ambiguous") {
      play("invalid");
      setWarning(`That could be ${verdict.options.join(" or ")}. Type a little more so it’s clear which.`);
      return;
    }
    const { answer: found } = verdict;
    const kind = diveOf(question.id, found.name, found.tier)!;
    play(SOUND[kind]);
    dive({ question: question.id, input: input.trim().slice(0, 80), answer: found.name, tier: found.tier, points: TIERS[found.tier].points });
  }

  function pass() {
    if (!question) return;
    play("tap");
    dive({ question: question.id, input: "", answer: null, tier: null, points: 0 });
  }

  function restart() {
    if (!done && index > 0 && !window.confirm("Surface now and abandon this descent?")) return;
    write(RECENT_KEY, round.questions);
    setRound(newRound(round.questions));
    setInput("");
    setWarning(null);
    setFresh(null);
    setNewBest(false);
  }

  const depth = fathoms(depthOf(round));
  const label = `The descent, ${round.stops.length} of ${STOPS} dives made, ${depth} fathoms deep. ${round.stops
    .map((stop, i) => {
      const kind = diveOf(stop.question, stop.answer, stop.tier);
      return `Dive ${i + 1}: ${stop.answer ?? "passed"}, ${kind ? DIVES[kind].name : "drifted"}.`;
    })
    .join(" ")}`;
  const flash = fresh !== null && fresh === index - 1 && lastDive === "extraordinary";

  return (
    <GameShell
      game={BLANK_ATLAS_GAME}
      title="The Descent"
      active={!done && index > 0}
      leaderboard={null}
      stats={
        <>
          <Stat label="Dive" value={`${Math.min(index + 1, STOPS)}/${STOPS}`} />
          <Stat label="Score" value={score} highlight={done} />
          <Stat label="Depth" value={`${depth} fm`} />
          <Stat label="Best" value={best || "–"} />
        </>
      }
      actions={
        done ? null : (
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={restart}>
            <RotateCcw aria-hidden />
            New descent
          </Button>
        )
      }
    >
      <div className="dv">
        {question ? (
          <section className="dv-panel" aria-labelledby="dv-prompt">
            <p className="dv-depth">
              Dive {index + 1} of {STOPS}
            </p>
            <h2 id="dv-prompt" className="dv-prompt">
              {question.prompt}
            </h2>
            {question.note ? <p className="dv-hint">{question.note}</p> : null}
            <form className="dv-form" onSubmit={answer} noValidate>
              <label htmlFor="dv-answer" className="sr-only">
                Your answer for dive {index + 1}
              </label>
              <input
                ref={inputRef}
                id="dv-answer"
                className="dv-input"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (warning) setWarning(null);
                }}
                maxLength={80}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="Your answer"
                aria-describedby="dv-feedback"
                aria-invalid={warning ? true : undefined}
              />
              <Button type="submit" className="dv-go h-11 px-5">
                <ArrowDown aria-hidden />
                Dive
              </Button>
            </form>
            <div id="dv-feedback" role="status" aria-live="polite">
              {warning ? <p className="dv-warn">{warning}</p> : last ? <DiveResult key={index} stop={last} number={index} fresh={fresh === index - 1} /> : (
                <p className="dv-hint">Any correct answer takes you down. The rarer it is, the deeper and brighter the dive.</p>
              )}
            </div>
            <button type="button" className="dv-pass" onClick={pass}>
              Let this one pass
            </button>
            <HowItWorks />
          </section>
        ) : (
          <Results round={round} score={score} depth={depth} best={best} newBest={newBest} onRestart={restart} />
        )}
        <div className="dv-stage" data-shake={flash || undefined}>
          <DescentShaft round={round} fresh={fresh} final={done} label={label} />
          {flash ? <span key={`flash-${fresh}`} aria-hidden className="dv-flash" /> : null}
        </div>
      </div>
    </GameShell>
  );
}

/** One dive's result: the answer, its dive and points, and a strength gauge that reads the same with motion off. */
function DiveResult({ stop, number, fresh }: { stop: Stop; number: number; fresh: boolean }) {
  const kind = diveOf(stop.question, stop.answer, stop.tier);
  const level = kind ? DIVES[kind].level : 0;
  return (
    <div className="dv-result" data-dive={kind ?? "drift"} data-fresh={fresh || undefined} style={tone(kind)}>
      <p className="dv-result-head">
        <span className="dv-strength" aria-hidden>
          {DIVE_ORDER.map((entry, i) => (
            <i key={entry} data-on={i < level || undefined} />
          ))}
        </span>
        {kind ? `${DIVES[kind].name} dive` : "Drifted"}
        <span className="dv-result-points">+{stop.points}</span>
      </p>
      <p className="dv-result-answer">
        Dive {number}: {stop.answer ?? "let pass"}
      </p>
      <p className="dv-result-motion">{kind ? `${DIVES[kind].motion[0].toUpperCase()}${DIVES[kind].motion.slice(1)}.` : "No answer, so you only drift a little lower."}</p>
    </div>
  );
}

function HowItWorks() {
  return (
    <details className="dv-how">
      <summary>How scoring works</summary>
      <p>
        Every question has a complete list of correct answers, and any of them counts. Rarer answers score more and dive deeper. A full descent is worth up to {MAX_SCORE}.
      </p>
      <ul>
        {DIVE_ORDER.map((kind) => (
          <li key={kind} style={tone(kind)}>
            <span aria-hidden className="dv-swatch" />
            <span>
              <strong>{DIVES[kind].name}</strong>:{" "}
              {kind === "extraordinary"
                ? `an Exceptional answer that stands alone in its question's rarest tier, ${TIERS[4].points} points`
                : `${TIERS[DIVES[kind].level as 1 | 2 | 3 | 4].points} points`}
            </span>
          </li>
        ))}
      </ul>
      <p>
        Rarity is Amethyst’s own curated estimate of how readily people think of each answer. It isn’t measured from how players actually answer. Small spelling slips are forgiven
        when the answer is still clear, a wrong answer just asks you to try again, and letting a question pass scores nothing.
      </p>
    </details>
  );
}

function Results({ round, score, depth, best, newBest, onRestart }: { round: Round; score: number; depth: number; best: number; newBest: boolean; onRestart: () => void }) {
  const deep = round.stops.filter((stop) => (stop.tier ?? 0) >= 3).length;
  return (
    <section className="dv-panel" aria-labelledby="dv-done">
      <h2 id="dv-done" className="dv-prompt">
        The descent is complete
      </h2>
      <p className="dv-total">
        {score}
        <span> of {MAX_SCORE}</span>
      </p>
      <p className="dv-hint">
        {depth} fathoms down. {newBest ? "Your best descent yet. " : best ? `Your best is ${best}. ` : ""}
        {deep ? `${deep} ${deep === 1 ? "dive" : "dives"} went rare or deeper.` : "Every dive stayed in the shallows this time."}
      </p>
      <ol className="dv-log">
        {round.stops.map((stop, i) => {
          const kind = diveOf(stop.question, stop.answer, stop.tier);
          return (
            <li key={stop.question} data-dive={kind ?? "drift"} style={tone(kind)}>
              <span className="dv-log-num">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="dv-log-q">{questionById(stop.question)?.prompt}</span>
                <span className="dv-log-a">
                  {stop.answer ? (
                    <>
                      <strong>{stop.answer}</strong>
                      {stop.input && stop.input.toLowerCase() !== stop.answer.toLowerCase() ? <> (you wrote “{stop.input}”)</> : null}
                    </>
                  ) : (
                    "Let pass"
                  )}
                </span>
              </span>
              <span className="dv-log-score">
                {kind ? DIVES[kind].name : "Drifted"}
                <strong>+{stop.points}</strong>
              </span>
            </li>
          );
        })}
      </ol>
      <Button size="lg" className="dv-go h-11 w-full" onClick={onRestart} autoFocus>
        <RotateCcw aria-hidden />
        Descend again
      </Button>
      <HowItWorks />
    </section>
  );
}

"use client";

import "./blank-atlas/blank-atlas.css";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Compass, MapPin, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BLANK_ATLAS_GAME,
  MAX_SCORE,
  STOPS,
  TIERS,
  judge,
  newRound,
  questionById,
  restoreRound,
  roundScore,
  type Round,
  type Stop,
  type Tier,
} from "@/lib/minigames/blank-atlas";
import { AtlasMap, placeOf, tierName } from "./blank-atlas/atlas-map";
import { GameShell, Stat, useArcade, useGameAchievementTracking, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

const SAVE_KEY = "amethyst:blank-atlas:round:v1";
const RECENT_KEY = "amethyst:blank-atlas:recent:v1";
const SOUND: Record<Tier, SoundName> = { 1: "place", 2: "chip", 3: "reveal", 4: "unlock" };

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

type Note = { tone: "warn" | "found"; text: string };

/** Blank Atlas: seven questions as seven stops of one expedition; rarer correct answers chart stranger places. */
export default function BlankAtlasGame({ records }: { records: Record<string, number> }) {
  const { play } = useArcade();
  const { best, submit } = useRecord(BLANK_ATLAS_GAME, records[""] ?? null);
  // The game only renders in the browser (see lazy.tsx), so the saved round can be read right away.
  const [round, setRound] = useState<Round>(() => restoreRound(read(SAVE_KEY)) ?? newRound(read<string[]>(RECENT_KEY) ?? []));
  const [input, setInput] = useState("");
  const [note, setNote] = useState<Note | null>(null);
  const [newBest, setNewBest] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const index = round.stops.length;
  const done = index >= STOPS;
  const question = done ? null : questionById(round.questions[index]);
  const score = roundScore(round);
  useGameAchievementTracking(BLANK_ATLAS_GAME, done ? "over" : "playing");

  useEffect(() => write(SAVE_KEY, round), [round]);
  useEffect(() => {
    if (!done) inputRef.current?.focus({ preventScroll: true });
  }, [index, done]);

  function chart(stop: Stop) {
    const next: Round = { ...round, stops: [...round.stops, stop] };
    setRound(next);
    setInput("");
    if (next.stops.length >= STOPS) {
      play("win");
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
      setNote({ tone: "warn", text: "Type an answer first, or leave this stop unmapped." });
      return;
    }
    if (verdict.kind === "miss") {
      play("invalid");
      setNote({ tone: "warn", text: verdict.reason ?? `“${input.trim()}” isn’t a correct answer here. Try another.` });
      inputRef.current?.select();
      return;
    }
    if (verdict.kind === "ambiguous") {
      play("invalid");
      setNote({ tone: "warn", text: `That could be ${verdict.options.join(" or ")}. Type a little more so the map knows which.` });
      return;
    }
    const { answer: found, corrected } = verdict;
    const tier = TIERS[found.tier];
    play(SOUND[found.tier]);
    setNote({
      tone: "found",
      text: `Stop ${index + 1}: ${found.name}${corrected ? ` (read from “${input.trim()}”)` : ""}. ${tier.name}, +${tier.points}.`,
    });
    chart({ question: question.id, input: input.trim().slice(0, 80), answer: found.name, tier: found.tier, points: tier.points });
  }

  function skip() {
    if (!question) return;
    play("tap");
    setNote({ tone: "found", text: `Stop ${index + 1} left unmapped. No points.` });
    chart({ question: question.id, input: "", answer: null, tier: null, points: 0 });
  }

  function restart() {
    if (!done && index > 0 && !window.confirm("Abandon this expedition and start a new one?")) return;
    write(RECENT_KEY, round.questions);
    setRound(newRound(round.questions));
    setInput("");
    setNote(null);
    setNewBest(false);
  }

  const mapLabel = `Expedition map, ${round.stops.length} of ${STOPS} stops charted. ${round.stops
    .map((stop, i) => `Stop ${i + 1}: ${stop.answer ?? "unmapped"}, ${tierName(stop.tier)}.`)
    .join(" ")}`;

  return (
    <GameShell
      game={BLANK_ATLAS_GAME}
      title="Blank Atlas"
      active={!done && index > 0}
      leaderboard={null}
      stats={
        <>
          <Stat label="Stop" value={`${Math.min(index + 1, STOPS)}/${STOPS}`} />
          <Stat label="Charted" value={score} highlight={done} />
          <Stat label="Best" value={best || "–"} />
        </>
      }
      actions={
        done ? null : (
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={restart}>
            <RotateCcw aria-hidden />
            New expedition
          </Button>
        )
      }
    >
      <div className="ba" data-done={done || undefined}>
        {question ? (
          <section className="ba-panel" aria-labelledby="ba-prompt">
            <p className="ba-place">
              Stop {index + 1} of {STOPS} · {question.place}
            </p>
            <h2 id="ba-prompt" className="ba-prompt">
              {question.prompt}
            </h2>
            {question.note ? <p className="ba-hint">{question.note}</p> : null}
            <form className="ba-form" onSubmit={answer} noValidate>
              <label htmlFor="ba-answer" className="sr-only">
                Your answer for stop {index + 1}
              </label>
              <input
                ref={inputRef}
                id="ba-answer"
                className="ba-input"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (note?.tone === "warn") setNote(null);
                }}
                maxLength={80}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                enterKeyHint="go"
                placeholder="Your answer"
                aria-describedby="ba-note"
                aria-invalid={note?.tone === "warn" || undefined}
              />
              <Button type="submit" className="ba-chart h-11 px-5">
                <MapPin aria-hidden />
                Chart it
              </Button>
            </form>
            <p id="ba-note" role="status" aria-live="polite" className="ba-note" data-tone={note?.tone}>
              {note?.text ?? "Any correct answer charts the stop. The rarer it is, the further it takes you."}
            </p>
            <button type="button" className="ba-skip" onClick={skip}>
              Leave this stop unmapped
            </button>
            <ScoringNote />
          </section>
        ) : (
          <Results round={round} score={score} best={best} newBest={newBest} onRestart={restart} />
        )}
        <div className="ba-map-wrap">
          <AtlasMap round={round} final={done} label={mapLabel} />
        </div>
      </div>
    </GameShell>
  );
}

function ScoringNote({ open = false }: { open?: boolean }) {
  return (
    <details className="ba-how" open={open}>
      <summary>How scoring works</summary>
      <p>
        Every question has a complete list of correct answers, and any of them charts the stop. Rarer answers lie further off the route and are worth more:{" "}
        {([1, 2, 3, 4] as const).map((tier, i) => (
          <span key={tier}>
            {i ? (i === 3 ? " and " : ", ") : ""}
            {TIERS[tier].name.toLowerCase()} {TIERS[tier].points}
          </span>
        ))}{" "}
        points. A stop left unmapped scores nothing, so a full expedition is worth up to {MAX_SCORE}.
      </p>
      <p>
        Rarity is Amethyst’s own curated estimate of how readily people think of each answer. It isn’t measured from how players actually answer. Small spelling slips are forgiven
        when the answer is still clear; a wrong answer just asks you to try again.
      </p>
    </details>
  );
}

function Results({ round, score, best, newBest, onRestart }: { round: Round; score: number; best: number; newBest: boolean; onRestart: () => void }) {
  const rare = round.stops.filter((stop) => (stop.tier ?? 0) >= 3).length;
  return (
    <section className="ba-panel ba-results" aria-labelledby="ba-done">
      <h2 id="ba-done" className="ba-prompt">
        <Compass aria-hidden className="ba-done-icon" />
        Expedition charted
      </h2>
      <p className="ba-total">
        {score}
        <span> of {MAX_SCORE}</span>
      </p>
      <p className="ba-hint">
        {newBest ? "Your best expedition yet. " : best ? `Your best is ${best}. ` : ""}
        {rare ? `${rare} ${rare === 1 ? "stop" : "stops"} reached strange shores or beyond.` : "Every stop stayed on known roads this time."}
      </p>
      <ol className="ba-log">
        {round.stops.map((stop, i) => {
          const question = questionById(stop.question);
          return (
            <li key={stop.question} data-tier={stop.tier ?? 0}>
              <span className="ba-log-num">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="ba-log-q">
                  {placeOf(stop.question)} · {question?.prompt}
                </span>
                <span className="ba-log-a">
                  {stop.answer ? (
                    <>
                      <strong>{stop.answer}</strong>
                      {stop.input && stop.input.toLowerCase() !== stop.answer.toLowerCase() ? <> (you wrote “{stop.input}”)</> : null}
                    </>
                  ) : (
                    "Left unmapped"
                  )}
                </span>
              </span>
              <span className="ba-log-score">
                {tierName(stop.tier)}
                <strong>+{stop.points}</strong>
              </span>
            </li>
          );
        })}
      </ol>
      <Button size="lg" className="ba-chart h-11 w-full" onClick={onRestart} autoFocus>
        <RotateCcw aria-hidden />
        New expedition
      </Button>
      <ScoringNote />
    </section>
  );
}

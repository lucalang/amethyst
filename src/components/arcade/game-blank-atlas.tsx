"use client";

import "./blank-atlas/descent.css";
import { useEffect, useEffectEvent, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { ArrowDown, Check, Copy, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ANSWER_MS,
  BLANK_ATLAS_GAME,
  DIVES,
  MAX_SCORE,
  METRES_PER_POINT,
  PREVIEW_MS,
  STOPS,
  TIERS,
  bandFor,
  diveOf,
  judge,
  newRound,
  questionById,
  restoreRound,
  roundScore,
  shareText,
  type Dive,
  type Round,
  type Stop,
  type Tier,
} from "@/lib/minigames/blank-atlas";
import { DescentWorld, DIVE_COLOR, PLUNGE_MS, type Plunge } from "./blank-atlas/descent-world";
import { GameShell, useArcade, useGameAchievementTracking, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

// Storage keys keep the game's original id, so saved rounds survive the retheme.
const SAVE_KEY = "amethyst:blank-atlas:round:v1";
const RECENT_KEY = "amethyst:blank-atlas:recent:v1";
const RELAXED_KEY = "amethyst:blank-atlas:relaxed:v1";
const ORDER: Dive[] = ["familiar", "uncommon", "rare", "exceptional", "extraordinary"];
const LAND_SOUND: Record<Dive, SoundName> = { familiar: "place", uncommon: "chip", rare: "reveal", exceptional: "power", extraordinary: "boom" };

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

type Phase =
  | { kind: "intro" }
  | { kind: "preview"; until: number }
  | { kind: "answering"; until: number }
  | { kind: "result"; number: number }
  | { kind: "complete" };

const tone = (dive: Dive | null) => ({ "--dv": dive ? DIVE_COLOR[dive] : "#7d808a" }) as CSSProperties;
const metres = (points: number) => `${(points * METRES_PER_POINT).toLocaleString("en")} m`;

function startingPhase(round: Round): Phase {
  if (round.stops.length >= STOPS) return { kind: "complete" };
  if (round.stops.length === 0) return { kind: "intro" };
  return { kind: "preview", until: Date.now() + PREVIEW_MS };
}

/** The Descent: seven questions, one continuous dive into the fog. Every point sinks the lantern 10 metres. */
export default function DescentGame({ records }: { records: Record<string, number> }) {
  const { play, effects } = useArcade();
  const { best, submit } = useRecord(BLANK_ATLAS_GAME, records[""] ?? null);
  // The game only renders in the browser (see lazy.tsx), so saved state can be read right away.
  const [round, setRound] = useState<Round>(() => restoreRound(read(SAVE_KEY)) ?? newRound(read<string[]>(RECENT_KEY) ?? []));
  const [phase, setPhase] = useState<Phase>(() => startingPhase(round));
  const [relaxed, setRelaxed] = useState(() => read<boolean>(RELAXED_KEY) === true);
  const [input, setInput] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [plunge, setPlunge] = useState<Plunge | null>(null);
  const [newBest, setNewBest] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastTick = useRef(0);
  const moving = effects !== "off";

  const index = round.stops.length;
  const score = roundScore(round);
  const question = phase.kind === "preview" || phase.kind === "answering" ? questionById(round.questions[index]) : null;
  useGameAchievementTracking(BLANK_ATLAS_GAME, phase.kind === "complete" ? "over" : phase.kind === "intro" ? "ready" : "playing");

  useEffect(() => write(SAVE_KEY, round), [round]);
  useEffect(() => write(RELAXED_KEY, relaxed), [relaxed]);

  useEffect(() => {
    if (phase.kind === "answering") inputRef.current?.focus({ preventScroll: true });
    if (phase.kind === "result") nextRef.current?.focus({ preventScroll: true });
  }, [phase.kind, index]);

  function shake(element: HTMLElement | null, strength: number, ms: number) {
    if (!element || !moving) return;
    const k = strength;
    element.animate(
      [{ translate: "0 0" }, { translate: `${-k}px ${k * 0.6}px` }, { translate: `${k}px ${-k * 0.6}px` }, { translate: `${-k * 0.5}px ${k * 0.3}px` }, { translate: "0 0" }],
      { duration: ms, easing: "cubic-bezier(0.36, 0.07, 0.19, 0.97)" },
    );
  }

  function begin() {
    play("swoosh");
    lastTick.current = 0;
    setPhase({ kind: "preview", until: Date.now() + PREVIEW_MS });
  }

  function land(stop: Stop) {
    const next: Round = { ...round, stops: [...round.stops, stop] };
    const dive = diveOf(stop.question, stop.answer, stop.tier);
    const from = score * METRES_PER_POINT;
    const ms = moving ? PLUNGE_MS[dive ?? "miss"] : 0;
    setRound(next);
    setInput("");
    setWarning(null);
    setPlunge({ from, to: from + stop.points * METRES_PER_POINT, dive, ms, key: Date.now() });
    setPhase({ kind: "result", number: next.stops.length });
    if (dive && DIVES[dive].level >= 3) {
      const level = DIVES[dive].level;
      window.setTimeout(() => shake(stageRef.current, level * 2.5 - 3, 300 + level * 80), ms * 0.85);
    }
    if (next.stops.length >= STOPS) {
      write(RECENT_KEY, next.questions);
      setNewBest(submit(roundScore(next)));
    }
  }

  function timeout() {
    const current = questionById(round.questions[index]);
    if (!current) return;
    play("miss");
    land({ question: current.id, input: input.trim().slice(0, 80), answer: null, tier: null, points: 0, timedOut: true });
  }

  function reject(text: string) {
    play("invalid");
    setWarning(text);
    shake(inputRef.current, 5, 340);
  }

  function answer(event: FormEvent) {
    event.preventDefault();
    if (!question || phase.kind !== "answering") return;
    const verdict = judge(question, input);
    if (verdict.kind === "empty") return reject("Type an answer first.");
    if (verdict.kind === "miss") {
      reject(verdict.reason ?? `“${input.trim()}” isn’t on the list. Try another before the bell.`);
      inputRef.current?.select();
      return;
    }
    if (verdict.kind === "ambiguous") return reject(`That could be ${verdict.options.join(" or ")}. Type a little more.`);
    const found = verdict.answer;
    land({ question: question.id, input: input.trim().slice(0, 80), answer: found.name, tier: found.tier, points: TIERS[found.tier].points });
  }

  function next() {
    setPlunge(null);
    lastTick.current = 0;
    if (round.stops.length >= STOPS) {
      setPhase({ kind: "complete" });
      play("win");
    } else {
      play("swoosh");
      setPhase({ kind: "preview", until: Date.now() + PREVIEW_MS });
    }
  }

  function restart() {
    if (phase.kind !== "complete" && index > 0 && !window.confirm("Surface now and abandon this descent?")) return;
    write(RECENT_KEY, round.questions);
    setRound(newRound(round.questions));
    setPlunge(null);
    setNewBest(false);
    setInput("");
    setWarning(null);
    setPhase({ kind: "intro" });
  }

  // The clock: ticks while a question is up, moves preview → answering, and runs out into a miss.
  const onTick = useEffectEvent(() => {
    const at = Date.now();
    setNow(at);
    if (phase.kind === "preview" && at >= phase.until) {
      setPhase({ kind: "answering", until: relaxed ? Infinity : at + ANSWER_MS });
      play("swoosh");
    } else if (phase.kind === "answering" && at >= phase.until) {
      timeout();
    } else if (phase.kind === "answering" && Number.isFinite(phase.until)) {
      const secondsLeft = Math.ceil((phase.until - at) / 1000);
      if (secondsLeft <= 3 && secondsLeft !== lastTick.current) {
        lastTick.current = secondsLeft;
        play("tick", 1.4);
      }
    }
  });
  const ticking = phase.kind === "preview" || phase.kind === "answering";
  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(onTick, 100);
    return () => window.clearInterval(id);
  }, [ticking]);

  const depthNow = score * METRES_PER_POINT;
  const shownDepth = useCountUp(depthNow, plunge?.ms ?? 0, plunge?.from ?? depthNow);
  const left = phase.kind === "answering" && Number.isFinite(phase.until) ? Math.max(0, phase.until - now) : null;
  const previewLeft = phase.kind === "preview" ? Math.max(1, Math.ceil((phase.until - now) / 1000)) : null;

  return (
    <GameShell
      game={BLANK_ATLAS_GAME}
      title="The Descent"
      active={phase.kind === "preview" || phase.kind === "answering" || phase.kind === "result"}
      leaderboard={null}
      actions={
        index > 0 && phase.kind !== "complete" ? (
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={restart}>
            <RotateCcw aria-hidden />
            Surface
          </Button>
        ) : null
      }
    >
      <div className="dv">
        <div ref={stageRef} className="dv-stage" data-phase={phase.kind}>
          <DescentWorld round={round} shown={round.stops.length} depth={depthNow} plunge={plunge} final={phase.kind === "complete"} />

          {/* HUD: depth, the seven questions, score. */}
          <div className="dv-hud">
            <div className="dv-pod">
              <span>Depth</span>
              <strong>{shownDepth.toLocaleString("en")} m</strong>
            </div>
            <div className="dv-dots">
              <ol aria-label={`Question ${Math.min(index + 1, STOPS)} of ${STOPS}`}>
                {Array.from({ length: STOPS }, (_, i) => {
                  const stop = round.stops[i];
                  const dive = stop ? diveOf(stop.question, stop.answer, stop.tier) : null;
                  return <li key={i} data-state={stop ? (dive ?? "miss") : i === index && phase.kind !== "intro" ? "now" : "ahead"} style={tone(dive)} />;
                })}
              </ol>
              <span>
                {phase.kind === "intro"
                  ? "Above the fog"
                  : phase.kind === "complete"
                    ? "Descent complete"
                    : `Question ${Math.min(phase.kind === "result" ? index : index + 1, STOPS)} of ${STOPS}`}
              </span>
            </div>
            <div className="dv-pod dv-pod-right">
              <span>Score</span>
              <strong>{score}</strong>
            </div>
          </div>

          {phase.kind === "intro" ? (
            <section className="dv-intro" aria-labelledby="dv-title">
              <h2 id="dv-title" className="dv-title">
                The Descent
              </h2>
              <p className="dv-tagline">Seven questions. One dive into the gray fog.</p>
              <ul className="dv-rules">
                <li>Name any correct answer. Rare answers score big; obvious ones barely sink.</li>
                <li>Every point sinks you 10 metres. 700 points reaches the Nameless Floor.</li>
                <li>{relaxed ? "Relaxed: no clock. Take your time." : "Each question gives you 3 seconds to read, then 25 to answer."}</li>
              </ul>
              <Button ref={(element) => element?.focus({ preventScroll: true })} size="lg" className="dv-go h-12 px-7 text-base" onClick={begin}>
                Begin the descent
                <ArrowDown aria-hidden />
              </Button>
              <label className="dv-relaxed">
                <input type="checkbox" checked={relaxed} onChange={(event) => setRelaxed(event.target.checked)} />
                Relaxed mode: no clock
              </label>
              {best ? <p className="dv-best">Your deepest descent: {best} points, {metres(best)}.</p> : null}
            </section>
          ) : null}

          {question ? (
            <section className="dv-ask" data-phase={phase.kind} aria-labelledby="dv-prompt">
              <p className="dv-ask-meta">
                {phase.kind === "preview" ? `Descending… the clock starts in ${previewLeft}` : left === null ? "No clock. Take your time." : `${Math.ceil(left / 1000)} seconds`}
              </p>
              <h2 id="dv-prompt" className="dv-prompt">
                {question.prompt}
              </h2>
              {question.note ? <p className="dv-hint">{question.note}</p> : null}
              {left !== null ? (
                <span className="dv-clock" data-urgent={left <= 5000 || undefined} aria-hidden>
                  <span style={{ width: `${(left / ANSWER_MS) * 100}%` }} />
                </span>
              ) : null}
              <form className="dv-form" onSubmit={answer} noValidate>
                <label htmlFor="dv-answer" className="sr-only">
                  Your answer
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
                  readOnly={phase.kind !== "answering"}
                  maxLength={80}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  enterKeyHint="go"
                  placeholder={phase.kind === "preview" ? "Get ready…" : "Type one answer…"}
                  aria-describedby="dv-warning"
                  aria-invalid={warning ? true : undefined}
                />
                <Button type="submit" className="dv-go h-11 px-5" disabled={phase.kind !== "answering"}>
                  Descend
                  <ArrowDown aria-hidden />
                </Button>
              </form>
              <p id="dv-warning" role="status" aria-live="polite" className="dv-warn">
                {warning ?? ""}
              </p>
            </section>
          ) : null}

          {phase.kind === "result" && round.stops[phase.number - 1] ? (
            <ResultCard key={phase.number} stop={round.stops[phase.number - 1]} number={phase.number} motion={moving} play={play} onNext={next} nextRef={nextRef} last={phase.number >= STOPS} />
          ) : null}

          {phase.kind === "complete" ? <Complete round={round} best={best} newBest={newBest} onRestart={restart} countUp={moving} /> : null}
        </div>
      </div>
    </GameShell>
  );
}

/** After an answer: the meter climbs to its tier, bursts in its colour, and the points count up; then onward. */
function ResultCard({
  stop,
  number,
  motion,
  play,
  onNext,
  nextRef,
  last,
}: {
  stop: Stop;
  number: number;
  motion: boolean;
  play: (name: SoundName, pitch?: number) => void;
  onNext: () => void;
  nextRef: RefObject<HTMLButtonElement | null>;
  last: boolean;
}) {
  const dive = diveOf(stop.question, stop.answer, stop.tier);
  const level = dive ? DIVES[dive].level : 0;
  const [lit, setLit] = useState(motion ? 0 : level);
  const [burst, setBurst] = useState(!motion);
  const points = useCountUp(burst ? stop.points : 0, burst && motion ? 500 + level * 90 : 0, 0);

  useEffect(() => {
    if (!motion) {
      if (dive) play(LAND_SOUND[dive]);
      return;
    }
    const timers: number[] = [];
    for (let k = 1; k <= level; k++) {
      timers.push(
        window.setTimeout(() => {
          setLit(k);
          play("tick", 0.8 + k * 0.18);
        }, 120 + k * 170),
      );
    }
    timers.push(
      window.setTimeout(() => {
        setBurst(true);
        if (dive) {
          play(LAND_SOUND[dive]);
          if (dive === "extraordinary") window.setTimeout(() => play("perfect"), 180);
        }
      }, 200 + level * 170),
    );
    return () => timers.forEach(window.clearTimeout);
    // One reveal per mount; the parent remounts this for each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const question = questionById(stop.question);
  const easy = question?.answers.find((entry) => entry.tier === 1)?.name;
  return (
    <section className="dv-result" data-dive={dive ?? "miss"} data-burst={burst || undefined} style={tone(dive)} aria-labelledby="dv-result-name">
      {burst && level >= 3 && motion ? <span aria-hidden className="dv-result-rays" /> : null}
      {burst && motion && dive ? <span aria-hidden className="dv-result-ring" /> : null}
      <p className="dv-ask-meta">Question {number}</p>
      <p className="dv-result-answer">{stop.answer ?? (stop.timedOut ? "The bell tolled" : "Lost in the fog")}</p>
      <div className="dv-meter" aria-hidden>
        {ORDER.map((entry, k) => (
          <i key={entry} data-on={k < lit || undefined} style={{ "--seg": DIVE_COLOR[entry] } as CSSProperties} />
        ))}
      </div>
      <p id="dv-result-name" className="dv-result-name" aria-live="polite">
        {burst ? (dive ? DIVES[dive].name : "No dive") : " "}
        <span className="dv-result-points">{burst ? `+${points}` : ""}</span>
      </p>
      <p className="dv-hint">
        {dive
          ? `${DIVES[dive].blurb} You sink ${metres(stop.points)}.`
          : `${stop.timedOut ? `The clock ran out${stop.input ? ` on “${stop.input}”` : ""}.` : "No answer charted."} The lantern stays where it is.${easy ? ` ${easy} would have counted.` : ""}`}
      </p>
      <Button ref={nextRef} size="lg" className="dv-go h-11 w-full" onClick={onNext}>
        {last ? "See the whole descent" : "Descend"}
        <ArrowDown aria-hidden />
      </Button>
    </section>
  );
}

function Complete({ round, best, newBest, onRestart, countUp }: { round: Round; best: number; newBest: boolean; onRestart: () => void; countUp: boolean }) {
  const score = roundScore(round);
  const shown = useCountUp(score, countUp ? 1500 : 0, 0);
  const band = bandFor(score);
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(shareText(round));
      setCopied(true);
      toast.success("Your descent is copied. Paste it anywhere.");
    } catch {
      toast.error("Couldn’t copy. Your browser blocked the clipboard.");
    }
  }

  return (
    <section className="dv-complete" aria-labelledby="dv-done">
      <p className="dv-ask-meta">Descent complete · {metres(score)}</p>
      <h2 id="dv-done" className="dv-total" aria-label={`${score} of ${MAX_SCORE} points`}>
        {shown}
        <span> / {MAX_SCORE}</span>
      </h2>
      <p className="dv-band">{band.verdict}</p>
      {newBest || best ? <p className="dv-hint">{newBest ? "Your deepest descent yet." : `Your deepest: ${best} points.`}</p> : null}
      <p className="dv-hint">Tap a question to see every answer that counted.</p>
      <ol className="dv-log">
        {round.stops.map((stop, i) => {
          const dive = diveOf(stop.question, stop.answer, stop.tier);
          const question = questionById(stop.question);
          return (
            <li key={stop.question} style={tone(dive)}>
              <details>
                <summary>
                  <span className="dv-log-num" data-dive={dive ?? "miss"}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="dv-log-q">{question?.prompt}</span>
                    <span className="dv-log-a">{stop.answer ?? (stop.timedOut ? "Out of time" : "Lost in the fog")}</span>
                  </span>
                  <span className="dv-log-score">
                    {dive ? DIVES[dive].name : "Miss"}
                    <strong>+{stop.points}</strong>
                  </span>
                </summary>
                {question ? <AnswerSheet questionId={question.id} yours={stop.answer} /> : null}
              </details>
            </li>
          );
        })}
      </ol>
      <div className="dv-complete-actions">
        <Button size="lg" className="dv-go h-11 flex-1" onClick={onRestart} autoFocus>
          <RotateCcw aria-hidden />
          Descend again
        </Button>
        <Button size="lg" variant="outline" className="h-11" onClick={() => void share()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          Share
        </Button>
      </div>
      <p className="dv-fine">Rarity is Amethyst’s own curated estimate of how readily people think of each answer, not a measurement of how players answer.</p>
    </section>
  );
}

/** Every accepted answer to one question, rarest first, with the player's own answer marked. */
function AnswerSheet({ questionId, yours }: { questionId: string; yours: string | null }) {
  const question = questionById(questionId);
  if (!question) return null;
  return (
    <div className="dv-sheet">
      {([4, 3, 2, 1] as Tier[]).map((tier) => {
        const answers = question.answers.filter((entry) => entry.tier === tier);
        if (!answers.length) return null;
        return (
          <div key={tier} className="dv-sheet-tier">
            <p>
              {TIERS[tier].name} · {TIERS[tier].points}
            </p>
            <ul>
              {answers.map((entry) => {
                const dive = diveOf(questionId, entry.name, entry.tier);
                return (
                  <li key={entry.name} data-yours={entry.name === yours || undefined} style={tone(dive)}>
                    {entry.name}
                    {dive === "extraordinary" ? " ★" : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Counts from `from` to `target` over `ms` (eased); with ms 0 it shows the target at once. */
function useCountUp(target: number, ms: number, from: number) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    let frame = 0;
    const start = performance.now();
    const tick = (at: number) => {
      const t = ms <= 0 ? 1 : Math.min(1, (at - start) / ms);
      setValue(Math.round(from + (target - from) * (1 - (1 - t) ** 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, ms, from]);
  return value;
}

"use client";

import "./the-ascent/ascent.css";
import "./the-ascent/cosmetics.css";
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties, type FormEvent, type RefObject } from "react";
import { ArrowUp, Check, Copy, RotateCcw, Sprout } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ANSWER_MS,
  ASCENT_GAME,
  GROWTHS,
  GROWTH_ORDER,
  MAX_SCORE,
  METRES_PER_POINT,
  PREVIEW_MS,
  STOPS,
  favouriteOf,
  growthOf,
  judge,
  newAscent,
  pointsFor,
  questionById,
  restoreAscent,
  roundScore,
  shareText,
  zoneAt,
  type Growth,
  type Round,
  type Stop,
  type Tier,
} from "@/lib/minigames/the-ascent";
import { AscentBurst } from "./the-ascent/ascent-burst";
import { ascentLook } from "./the-ascent/look";
import { AscentWorld, CLIMB_MS, GROWTH_COLOR, type Climb } from "./the-ascent/ascent-world";
import { GameShell, useArcade, useGameAchievementTracking, useRecord } from "./game-shell";
import type { SoundName } from "./sound";

const SAVE_KEY = "amethyst:the-ascent:round:v1";
const RECENT_KEY = "amethyst:the-ascent:recent:v1";
const RELAXED_KEY = "amethyst:the-ascent:relaxed:v1";
const LAND_SOUND: Record<Growth, SoundName> = { bud: "tap", shoot: "chip", vine: "place", sprout: "power", giant: "win" };

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

const tone = (growth: Growth | null) => ({ "--gw": growth ? GROWTH_COLOR[growth] : "#9aa3ad" }) as CSSProperties;
const metres = (points: number) => `${(points * METRES_PER_POINT).toLocaleString("en")} m`;

function startingPhase(round: Round): Phase {
  if (round.stops.length >= STOPS) return { kind: "complete" };
  if (round.stops.length === 0) return { kind: "intro" };
  return { kind: "preview", until: Date.now() + PREVIEW_MS };
}

/** The Ascent: seven questions; give the answer most people would give, and the beanstalk grows toward the clouds. */
export default function AscentGame({ records }: { records: Record<string, number> }) {
  const { play, effects, look: equipped } = useArcade();
  // Cosmetics from The Ascent's shop; equipping one from the in-game shop restyles the climb at once.
  const look = useMemo(() => ascentLook(equipped), [equipped]);
  const { best, submit } = useRecord(ASCENT_GAME, records[""] ?? null);
  // The game only renders in the browser (see lazy.tsx), so saved state can be read right away.
  const [round, setRound] = useState<Round>(() => restoreAscent(read(SAVE_KEY)) ?? newAscent(read<string[]>(RECENT_KEY) ?? []));
  const [phase, setPhase] = useState<Phase>(() => startingPhase(round));
  const [relaxed, setRelaxed] = useState(() => read<boolean>(RELAXED_KEY) === true);
  const [input, setInput] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const [climb, setClimb] = useState<Climb | null>(null);
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
  useGameAchievementTracking(ASCENT_GAME, phase.kind === "complete" ? "over" : phase.kind === "intro" ? "ready" : "playing");

  useEffect(() => write(SAVE_KEY, round), [round]);
  useEffect(() => write(RELAXED_KEY, relaxed), [relaxed]);

  useEffect(() => {
    if (phase.kind === "answering") inputRef.current?.focus({ preventScroll: true });
    if (phase.kind === "result") nextRef.current?.focus({ preventScroll: true });
  }, [phase.kind, index]);

  /** A bounce of the whole stage (Web Animations, so nothing remounts). */
  function bounce(element: HTMLElement | null, strength: number, ms: number) {
    if (!element || !moving) return;
    const k = strength;
    element.animate(
      [{ translate: "0 0" }, { translate: `0 ${k}px` }, { translate: `0 ${-k * 0.6}px` }, { translate: `0 ${k * 0.3}px` }, { translate: "0 0" }],
      { duration: ms, easing: "cubic-bezier(0.3, 1.4, 0.5, 1)" },
    );
  }
  function shake(element: HTMLElement | null) {
    if (!element || !moving) return;
    element.animate([{ translate: "0 0" }, { translate: "-5px 0" }, { translate: "5px 0" }, { translate: "-3px 0" }, { translate: "0 0" }], { duration: 340 });
  }

  function begin() {
    play("swoosh");
    lastTick.current = 0;
    setPhase({ kind: "preview", until: Date.now() + PREVIEW_MS });
  }

  function land(stop: Stop) {
    const next: Round = { ...round, stops: [...round.stops, stop] };
    const growth = growthOf(stop.question, stop.answer, stop.tier);
    const from = score * METRES_PER_POINT;
    const ms = moving ? CLIMB_MS[growth ?? "miss"] : 0;
    setRound(next);
    setInput("");
    setWarning(null);
    setClimb({ from, to: from + stop.points * METRES_PER_POINT, growth, ms, key: Date.now() });
    setPhase({ kind: "result", number: next.stops.length });
    if (growth && GROWTHS[growth].level >= 4) {
      const level = GROWTHS[growth].level;
      window.setTimeout(() => bounce(stageRef.current, level * 2.5, 520 + level * 60), ms * 0.9);
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
    shake(inputRef.current);
  }

  function answer(event: FormEvent) {
    event.preventDefault();
    if (!question || phase.kind !== "answering") return;
    const verdict = judge(question, input);
    if (verdict.kind === "empty") return reject("Type an answer first.");
    if (verdict.kind === "miss") {
      reject(verdict.reason ?? `“${input.trim()}” isn’t on the list. Try another before the clock runs out.`);
      inputRef.current?.select();
      return;
    }
    if (verdict.kind === "ambiguous") return reject(`That could be ${verdict.options.join(" or ")}. Type a little more.`);
    const found = verdict.answer;
    land({ question: question.id, input: input.trim().slice(0, 80), answer: found.name, tier: found.tier, points: pointsFor(question.id, found.name, found.tier) });
  }

  function next() {
    setClimb(null);
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
    if (phase.kind !== "complete" && index > 0 && !window.confirm("Climb down and abandon this beanstalk?")) return;
    write(RECENT_KEY, round.questions);
    setRound(newAscent(round.questions));
    setClimb(null);
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

  const heightNow = score * METRES_PER_POINT;
  const shownHeight = useCountUp(heightNow, climb?.ms ?? 0, climb?.from ?? heightNow);
  const left = phase.kind === "answering" && Number.isFinite(phase.until) ? Math.max(0, phase.until - now) : null;
  const previewLeft = phase.kind === "preview" ? Math.max(1, Math.ceil((phase.until - now) / 1000)) : null;

  return (
    <GameShell
      game={ASCENT_GAME}
      title="The Ascent"
      active={phase.kind === "preview" || phase.kind === "answering" || phase.kind === "result"}
      actions={
        index > 0 && phase.kind !== "complete" ? (
          <Button variant="outline" size="sm" className="h-8 px-2.5" onClick={restart}>
            <RotateCcw aria-hidden />
            Climb down
          </Button>
        ) : null
      }
    >
      <div className="as" data-style={look.style}>
        <div ref={stageRef} className="as-stage" data-phase={phase.kind}>
          <AscentWorld round={round} height={heightNow} climb={climb} final={phase.kind === "complete"} look={look} />

          <div className="as-hud">
            <div className="as-pod">
              <span>Height</span>
              <strong>{shownHeight.toLocaleString("en")} m</strong>
            </div>
            <div className="as-dots">
              <ol aria-label={`Question ${Math.min(index + 1, STOPS)} of ${STOPS}`}>
                {Array.from({ length: STOPS }, (_, i) => {
                  const stop = round.stops[i];
                  const growth = stop ? growthOf(stop.question, stop.answer, stop.tier) : null;
                  return <li key={i} data-state={stop ? (growth ?? "miss") : i === index && phase.kind !== "intro" ? "now" : "ahead"} style={tone(growth)} />;
                })}
              </ol>
              <span>
                {phase.kind === "intro"
                  ? "On the ground"
                  : phase.kind === "complete"
                    ? "Climb complete"
                    : `Question ${Math.min(phase.kind === "result" ? index : index + 1, STOPS)} of ${STOPS} · ${zoneAt(heightNow).name}`}
              </span>
            </div>
            <div className="as-pod as-pod-right">
              <span>Score</span>
              <strong>{score}</strong>
            </div>
          </div>

          {phase.kind === "intro" ? (
            <section className="as-intro" aria-labelledby="as-title">
              <h2 id="as-title" className="as-title">
                The Ascent
              </h2>
              <p className="as-tagline">Seven questions. One magic bean. Think like everyone else.</p>
              <ul className="as-rules">
                <li>Give the answer you think most people would give. The more common, the higher the beanstalk grows.</li>
                <li>Every point grows it 10 metres. 700 points reaches the Giant’s Kingdom.</li>
                <li>Each question has one crowd favourite, our pick for the most common answer. Say it for a Giant’s Leap.</li>
                <li>{relaxed ? "Relaxed: no clock. Take your time." : "Each question gives you 3 seconds to read, then 25 to answer."}</li>
              </ul>
              <Button ref={(element) => element?.focus({ preventScroll: true })} size="lg" className="as-go h-12 px-7 text-base" onClick={begin}>
                <Sprout aria-hidden />
                Plant the bean
              </Button>
              <label className="as-relaxed">
                <input type="checkbox" checked={relaxed} onChange={(event) => setRelaxed(event.target.checked)} />
                Relaxed mode: no clock
              </label>
              {best ? <p className="as-best">Your highest climb: {best} points, {metres(best)}.</p> : null}
            </section>
          ) : null}

          {question ? (
            <section className="as-ask" data-phase={phase.kind} aria-labelledby="as-prompt">
              <p className="as-meta">
                {phase.kind === "preview" ? `Climbing… the clock starts in ${previewLeft}` : left === null ? "No clock. Take your time." : `${Math.ceil(left / 1000)} seconds`}
              </p>
              <h2 id="as-prompt" className="as-prompt">
                {question.prompt}
              </h2>
              <p className="as-hint">{question.note ? `${question.note} ` : ""}Go for the most common answer.</p>
              {left !== null ? (
                <span className="as-clock" data-urgent={left <= 5000 || undefined} aria-hidden>
                  <span style={{ width: `${(left / ANSWER_MS) * 100}%` }} />
                </span>
              ) : null}
              <form className="as-form" onSubmit={answer} noValidate>
                <label htmlFor="as-answer" className="sr-only">
                  Your answer
                </label>
                <input
                  ref={inputRef}
                  id="as-answer"
                  className="as-input"
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
                  placeholder={phase.kind === "preview" ? "Get ready…" : "The obvious answer…"}
                  aria-describedby="as-warning"
                  aria-invalid={warning ? true : undefined}
                />
                <Button type="submit" className="as-go h-11 px-5" disabled={phase.kind !== "answering"}>
                  Climb
                  <ArrowUp aria-hidden />
                </Button>
              </form>
              <p id="as-warning" role="status" aria-live="polite" className="as-warn">
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

/** After an answer: the commonness meter fills to its group, the celebration plays, and the points count up. */
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
  const growth = growthOf(stop.question, stop.answer, stop.tier);
  const level = growth ? GROWTHS[growth].level : 0;
  const [lit, setLit] = useState(motion ? 0 : level);
  const [burst, setBurst] = useState(!motion);
  const points = useCountUp(burst ? stop.points : 0, burst && motion ? 500 + level * 90 : 0, 0);
  const favourite = favouriteOf(stop.question);

  useEffect(() => {
    if (!motion) {
      if (growth) play(LAND_SOUND[growth]);
      return;
    }
    const timers: number[] = [];
    for (let k = 1; k <= level; k++) {
      timers.push(
        window.setTimeout(() => {
          setLit(k);
          play("tick", 0.8 + k * 0.18);
        }, 120 + k * 160),
      );
    }
    timers.push(
      window.setTimeout(() => {
        setBurst(true);
        if (growth) {
          play(LAND_SOUND[growth]);
          if (growth === "giant") window.setTimeout(() => play("perfect"), 220);
        }
      }, 200 + level * 160),
    );
    return () => timers.forEach(window.clearTimeout);
    // One reveal per mount; the parent remounts this for each answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      {burst && motion && growth ? <AscentBurst growth={growth} /> : null}
      <section className="as-result" data-growth={growth ?? "miss"} data-burst={burst || undefined} style={tone(growth)} aria-labelledby="as-result-name">
        <p className="as-meta">Question {number}</p>
        <p className="as-result-answer">{stop.answer ?? (stop.timedOut ? "Out of time" : "Wilted")}</p>
        <div className="as-meter" aria-hidden>
          <span>Rare</span>
          {GROWTH_ORDER.map((entry, k) => (
            <i key={entry} data-on={k < lit || undefined} style={{ "--seg": GROWTH_COLOR[entry] } as CSSProperties} />
          ))}
          <span>Crowd favourite</span>
        </div>
        <p id="as-result-name" className="as-result-name" aria-live="polite">
          {burst ? (growth ? GROWTHS[growth].name : "No growth") : " "}
          <span className="as-result-points">{burst ? `+${points}` : ""}</span>
        </p>
        <p className="as-hint">
          {growth
            ? `${GROWTHS[growth].commonness}. ${GROWTHS[growth].blurb} The beanstalk grows ${metres(stop.points)}.`
            : `${stop.timedOut ? `The clock ran out${stop.input ? ` on “${stop.input}”` : ""}.` : "No answer."} The beanstalk doesn’t grow.`}
        </p>
        {burst && favourite && growth !== "giant" ? (
          <p className="as-fav">
            The crowd favourite was <strong>{favourite}</strong>
          </p>
        ) : null}
        <Button ref={nextRef} size="lg" className="as-go h-11 w-full" onClick={onNext}>
          {last ? "See the whole beanstalk" : "Keep climbing"}
          <ArrowUp aria-hidden />
        </Button>
      </section>
    </>
  );
}

function Complete({ round, best, newBest, onRestart, countUp }: { round: Round; best: number; newBest: boolean; onRestart: () => void; countUp: boolean }) {
  const score = roundScore(round);
  const shown = useCountUp(score, countUp ? 1500 : 0, 0);
  const zone = zoneAt(score * METRES_PER_POINT);
  const [copied, setCopied] = useState(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(shareText(round));
      setCopied(true);
      toast.success("Your climb is copied. Paste it anywhere.");
    } catch {
      toast.error("Couldn’t copy. Your browser blocked the clipboard.");
    }
  }

  return (
    <section className="as-complete" aria-labelledby="as-done">
      <p className="as-meta">Climb complete · {metres(score)}</p>
      <h2 id="as-done" className="as-total" aria-label={`${score} of ${MAX_SCORE} points`}>
        {shown}
        <span> / {MAX_SCORE}</span>
      </h2>
      <p className="as-band">{zone.verdict}</p>
      {newBest || best ? <p className="as-hint">{newBest ? "Your highest climb yet." : `Your highest: ${best} points.`}</p> : null}
      <p className="as-hint">Tap a question to see every answer that counted, most common first.</p>
      <ol className="as-log">
        {round.stops.map((stop, i) => {
          const growth = growthOf(stop.question, stop.answer, stop.tier);
          const question = questionById(stop.question);
          return (
            <li key={stop.question} style={tone(growth)}>
              <details>
                <summary>
                  <span className="as-log-num" data-growth={growth ?? "miss"}>
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="as-log-q">{question?.prompt}</span>
                    <span className="as-log-a">{stop.answer ?? (stop.timedOut ? "Out of time" : "Wilted")}</span>
                  </span>
                  <span className="as-log-score">
                    {growth ? GROWTHS[growth].commonness : "Miss"}
                    <strong>+{stop.points}</strong>
                  </span>
                </summary>
                {question ? <AnswerSheet questionId={question.id} yours={stop.answer} /> : null}
              </details>
            </li>
          );
        })}
      </ol>
      <div className="as-complete-actions">
        <Button size="lg" className="as-go h-11 flex-1" onClick={onRestart} autoFocus>
          <Sprout aria-hidden />
          Plant another bean
        </Button>
        <Button size="lg" variant="outline" className="h-11" onClick={() => void share()}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          Share
        </Button>
      </div>
      <p className="as-fine">
        Commonness is Amethyst’s own curated ranking of how readily people give each answer, not a measurement of how players answer. The crowd favourite is our pick for the single most
        common answer. Each question accepts a long list of answers; a real answer that’s missing from it can’t count yet.
      </p>
    </section>
  );
}

/** Every accepted answer to one question, most common first, with the crowd favourite and the player's answer marked. */
function AnswerSheet({ questionId, yours }: { questionId: string; yours: string | null }) {
  const question = questionById(questionId);
  if (!question) return null;
  const favourite = favouriteOf(questionId);
  const groups: { tier: Tier; growth: Growth }[] = [
    { tier: 1, growth: "sprout" },
    { tier: 2, growth: "vine" },
    { tier: 3, growth: "shoot" },
    { tier: 4, growth: "bud" },
  ];
  return (
    <div className="as-sheet">
      {groups.map(({ tier, growth }) => {
        const answers = question.answers.filter((entry) => entry.tier === tier);
        if (!answers.length) return null;
        return (
          <div key={tier} className="as-sheet-tier" style={tone(growth)}>
            <p>
              {GROWTHS[growth].commonness} · {GROWTHS[growth].points}
            </p>
            <ul>
              {answers.map((entry) => (
                <li key={entry.name} data-yours={entry.name === yours || undefined} data-fav={entry.name === favourite || undefined}>
                  {entry.name}
                  {entry.name === favourite ? ` ★ ${GROWTHS.giant.points}` : ""}
                </li>
              ))}
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

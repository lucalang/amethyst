"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { ExternalLink, Loader2, Minus, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMeasure, type SizePrompt, type SizeThing } from "@/lib/minigames/guess-the";
import { ArtDefs, artwork } from "./size-art";
import { CountUp, promptVerdict, toneOf } from "./fx";
import { RoundGame, type PlayProps } from "./round-game";

/** Slider steps across the prompt's range (log scale). */
const STEPS = 1000;
const ratioText = (ratio: number) => `${ratio >= 10 ? ratio.toFixed(1) : ratio >= 1 ? ratio.toFixed(2) : ratio.toFixed(3)}×`;

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    setWidth(Math.floor(element.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/** A thing's box in reference units (the reference's measured side is 1). */
const boxOf = (thing: SizeThing, measure: number) => (thing.axis === "height" ? { w: measure * thing.aspect, h: measure } : { w: measure, h: measure / thing.aspect });

/**
 * Both things side by side on one ground line, at true scale to each other. The scene zooms to fit whichever is
 * bigger; the reference's real size never changes. After the reveal the subject shows at its real size, with the
 * guess as a dashed outline.
 */
function Scene({ prompt, ratio, ghost, onDrag }: { prompt: SizePrompt; ratio: number; ghost: number | null; onDrag?: (factor: number) => void }) {
  const { ref, width } = useWidth();
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const height = Math.round(Math.min(360, Math.max(220, width * 0.6)));
  const pad = 12;
  const gap = Math.max(16, width * 0.05);
  const labelSpace = 34;
  const ref1 = boxOf(prompt.reference, 1);
  const sub = boxOf(prompt.subject, ratio);
  const ghostBox = ghost === null ? null : boxOf(prompt.subject, ghost);
  const subW = Math.max(sub.w, ghostBox?.w ?? 0);
  const subH = Math.max(sub.h, ghostBox?.h ?? 0);
  const scale = Math.max(0.0001, Math.min((height - labelSpace - pad) / Math.max(ref1.h, subH), (width - gap - pad * 2) / (ref1.w + subW)));
  const ground = height - labelSpace;
  const left = (width - (ref1.w + subW) * scale - gap) / 2;
  const refX = left;
  const subX = left + ref1.w * scale + gap;
  const thing = (t: SizeThing, x: number, box: { w: number; h: number }, key: string, dashed = false) => {
    const w = box.w * scale;
    const h = box.h * scale;
    const y = ground - h;
    if (dashed) return <rect key={key} x={x} y={y} width={w} height={h} fill="none" stroke="var(--rose)" strokeWidth="2" strokeDasharray="6 4" rx="3" />;
    return (
      <svg key={key} x={x} y={y} width={Math.max(1, w)} height={Math.max(1, h)} viewBox={`0 0 ${100 * t.aspect} 100`} preserveAspectRatio="none" overflow="visible">
        {artwork(t.art, 100 * t.aspect)}
      </svg>
    );
  };
  const bracket = (t: SizeThing, x: number, box: { w: number; h: number }, color: string) => {
    const w = box.w * scale;
    const h = box.h * scale;
    if (t.axis === "height") {
      const bx = x + w + 5;
      return <path d={`M${bx - 3} ${ground - h} H${bx + 3} M${bx} ${ground - h} V${ground} M${bx - 3} ${ground} H${bx + 3}`} stroke={color} strokeWidth="2" />;
    }
    const by = ground + 6;
    return <path d={`M${x} ${by - 3} V${by + 3} M${x} ${by} H${x + w} M${x + w} ${by - 3} V${by + 3}`} stroke={color} strokeWidth="2" />;
  };

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!onDrag || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    if (!onDrag || !current || current.id !== event.pointerId) return;
    // Dragging right or up grows the thing; down or left shrinks it.
    const delta = event.clientX - current.x - (event.clientY - current.y);
    drag.current = { ...current, x: event.clientX, y: event.clientY };
    if (delta) onDrag(Math.exp(delta / 160));
  }

  return (
    <div ref={ref} className="w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${prompt.reference.name} and ${prompt.subject.name}, side by side at ${ghost === null ? "your guessed" : "their real"} relative size`}
          className="block touch-none select-none"
          style={{ cursor: onDrag ? "ew-resize" : undefined }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <ArtDefs />
          <line x1="0" x2={width} y1={ground} y2={ground} stroke="var(--gt-a)" strokeOpacity="0.45" strokeWidth="1.5" />
          <ellipse cx={refX + (ref1.w * scale) / 2} cy={ground} rx={(ref1.w * scale) / 2} ry="4" fill="rgb(0 0 0 / 0.35)" />
          <ellipse cx={subX + (sub.w * scale) / 2} cy={ground} rx={(sub.w * scale) / 2} ry="4" fill="rgb(0 0 0 / 0.35)" />
          {thing(prompt.reference, refX, ref1, "ref")}
          {thing(prompt.subject, subX, sub, "sub")}
          {ghostBox ? thing(prompt.subject, subX, ghostBox, "ghost", true) : null}
          {bracket(prompt.reference, refX, ref1, "var(--muted-foreground)")}
          {bracket(prompt.subject, subX, sub, "var(--amethyst)")}
          <text x={refX + (ref1.w * scale) / 2} y={height - 8} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
            {prompt.reference.name}
          </text>
          <text x={subX + (sub.w * scale) / 2} y={height - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--gt-a)">
            {prompt.subject.name}
          </text>
        </svg>
      ) : (
        <div style={{ height: 260 }} />
      )}
    </div>
  );
}

/** Eases the shown size from the guess to the real size once revealed, so you see how far off it was. */
function useRevealRatio(result: { guess: number; actual: number } | null, animate: boolean) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (!result) return;
    if (!animate) {
      const id = requestAnimationFrame(() => setShown(result.actual));
      return () => cancelAnimationFrame(id);
    }
    let frame = 0;
    const start = performance.now();
    const from = Math.log(result.guess);
    const to = Math.log(result.actual);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start - 250) / 900);
      const k = t <= 0 ? 0 : 1 - (1 - t) ** 3;
      setShown(Math.exp(from + (to - from) * k));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [result, animate]);
  return result ? (shown ?? result.guess) : null;
}

function SizePlay({ prompt, result, busy, onGuess, animate }: PlayProps<"size">) {
  const [lo, hi] = prompt.range;
  const span = Math.log(hi / lo);
  const toStep = (ratio: number) => Math.round((Math.log(ratio / lo) / span) * STEPS);
  const fromStep = (step: number) => lo * Math.exp((step / STEPS) * span);
  // Start in the middle of the slider's (log) range, which is never the answer.
  const [step, setStep] = useState(STEPS / 2);
  const sliderId = useId();
  const ratio = fromStep(step);
  const clampStep = (value: number) => Math.min(STEPS, Math.max(0, Math.round(value)));
  const nudge = (factor: number) => setStep((current) => clampStep(toStep(fromStep(current) * factor)));
  const revealRatio = useRevealRatio(result, animate);

  return (
    <section className="gt-card gt-card-hero flex flex-col gap-4 p-3 sm:p-6">
      <header className="flex flex-col gap-2 px-1">
        <div className="flex flex-wrap gap-1.5">
          <span className="gt-chip gt-chip-accent">{prompt.topic}</span>
          <span className="gt-chip">Compared by {prompt.dimension}</span>
        </div>
        <h2 className="gt-display text-3xl text-balance sm:text-4xl">
          How big is <span className="gt-gradient-text">{prompt.subject.name}</span>?
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Next to {prompt.reference.name} ({prompt.reference.detail}), resize {prompt.subject.name} ({prompt.subject.detail}) to its real size.
        </p>
      </header>

      <div className="gt-blueprint p-2 sm:p-3">
        <Scene prompt={prompt} ratio={revealRatio ?? ratio} ghost={result ? result.guess : null} onDrag={result || busy ? undefined : (factor) => setStep((current) => clampStep(toStep(fromStep(current) * factor)))} />
      </div>

      {result ? (
        <div aria-live="polite" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span data-tone={toneOf(result.score)} className="gt-verdict">
              {promptVerdict(result.score)}
            </span>
            <span className="text-sm text-muted-foreground">
              Score{" "}
              <span data-tone={toneOf(result.score)} className="text-2xl font-extrabold text-[var(--tone)] tabular-nums">
                <CountUp value={result.score} animate={animate} />
              </span>
              /100
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="gt-tile gt-tile-accent gt-pop">
              <p>Real {prompt.dimension}</p>
              <p>{ratioText(result.actual)}</p>
            </div>
            <div className="gt-tile gt-tile-guess">
              <p>Your guess (dashed)</p>
              <p>{ratioText(result.guess)}</p>
            </div>
          </div>
          <p className="text-sm text-pretty">
            {prompt.subject.name} is <b>{formatMeasure(result.subject.value, result.subject.unit)}</b> and {prompt.reference.name} is <b>{formatMeasure(result.reference.value, result.reference.unit)}</b>, so {prompt.subject.name} is{" "}
            <b className="text-[var(--gt-a)]">{ratioText(result.actual)}</b> the {prompt.dimension} of {prompt.reference.name}.
          </p>
          <p className="text-xs text-pretty text-muted-foreground">
            {result.note} Sources:{" "}
            {result.sources.map((source, i) => (
              <span key={source.url}>
                {i ? "; " : ""}
                {source.publisher},{" "}
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="gt-link">
                  {source.title}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              </span>
            ))}
            .
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onGuess(ratio);
          }}
        >
          <div className="flex items-end justify-between gap-3 px-1">
            <label htmlFor={sliderId} className="gt-kicker">
              {prompt.subject.name}’s {prompt.dimension}
            </label>
            <p className="text-right leading-none">
              <span className="gt-display text-4xl tabular-nums sm:text-5xl">{ratioText(ratio)}</span>
              <span className="block pt-1 text-xs text-muted-foreground">{prompt.reference.name}’s</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-full" onClick={() => nudge(1 / 1.03)} disabled={busy} aria-label="Smaller">
              <Minus aria-hidden />
            </Button>
            <input
              id={sliderId}
              type="range"
              min={0}
              max={STEPS}
              step={1}
              value={step}
              onChange={(event) => setStep(Number(event.target.value))}
              disabled={busy}
              aria-valuetext={`${ratioText(ratio)} the ${prompt.dimension} of ${prompt.reference.name}`}
              className="gt-range"
              style={{ "--fill": `${(step / STEPS) * 100}%` } as CSSProperties}
            />
            <Button type="button" variant="outline" size="icon" className="size-11 shrink-0 rounded-full" onClick={() => nudge(1.03)} disabled={busy} aria-label="Bigger">
              <Plus aria-hidden />
            </Button>
          </div>
          <Button type="submit" size="lg" className="gt-go h-12 self-end rounded-full px-6 text-base" disabled={busy}>
            {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
            Lock it in
          </Button>
        </form>
      )}
    </section>
  );
}

export default function GuessTheSize({ best }: { best: number | null }) {
  return (
    <RoundGame
      mode="size"
      title="Guess the Real Size"
      best={best}
      noun="comparison"
      howTo={
        <p>
          The thing on the left stays its real size. Make the one on the right match it: drag across the picture (right or up to grow it, left or down to shrink it), move the slider, or use − and +. With a keyboard, focus the slider and
          use the arrow keys (Page Up and Page Down for big steps). The scene zooms out to fit, so judge the two against each other, not against the screen. Then press Reveal.
        </p>
      }
      Play={SizePlay}
      summary={(prompt, result) => (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">
            {prompt.subject.name} vs {prompt.reference.name}
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            real {ratioText(result.actual)} · you said {ratioText(result.guess)}
          </span>
        </span>
      )}
    />
  );
}

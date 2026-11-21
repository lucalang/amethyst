"use client";

import { useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { ExternalLink, Loader2, Minus, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMeasure, type SizePrompt, type SizeThing } from "@/lib/minigames/guess-the";
import { ArtDefs, artwork } from "./size-art";
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
          className="gtc-plot block touch-none select-none"
          style={{ cursor: onDrag ? "ew-resize" : undefined }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          <ArtDefs />
          <line x1="0" x2={width} y1={ground} y2={ground} stroke="currentColor" strokeOpacity="0.25" />
          {thing(prompt.reference, refX, ref1, "ref")}
          {thing(prompt.subject, subX, sub, "sub")}
          {ghostBox ? thing(prompt.subject, subX, ghostBox, "ghost", true) : null}
          {bracket(prompt.reference, refX, ref1, "var(--muted-foreground)")}
          {bracket(prompt.subject, subX, sub, "var(--amethyst)")}
          <text x={refX + (ref1.w * scale) / 2} y={height - 8} textAnchor="middle" fontSize="12" fill="var(--muted-foreground)">
            {prompt.reference.name}
          </text>
          <text x={subX + (sub.w * scale) / 2} y={height - 8} textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--foreground)">
            {prompt.subject.name}
          </text>
        </svg>
      ) : (
        <div style={{ height: 260 }} />
      )}
    </div>
  );
}

function SizePlay({ prompt, result, busy, onGuess }: PlayProps<"size">) {
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

  return (
    <section className="gtc-panel flex flex-col gap-3 p-3 sm:p-5">
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap gap-1.5">
          <span className="gtc-chip gtc-chip-accent">{prompt.topic}</span>
          <span className="gtc-chip">Compared by {prompt.dimension}</span>
        </div>
        <h2 className="text-xl leading-tight font-extrabold tracking-tight text-balance sm:text-2xl">
          How big is {prompt.subject.name} next to {prompt.reference.name}?
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Resize <span className="font-semibold text-foreground">{prompt.subject.name}</span> ({prompt.subject.detail}) to match its real size next to <span className="font-semibold text-foreground">{prompt.reference.name}</span> (
          {prompt.reference.detail}).
        </p>
      </header>

      <Scene prompt={prompt} ratio={result ? result.actual : ratio} ghost={result ? result.guess : null} onDrag={result || busy ? undefined : (factor) => setStep((current) => clampStep(toStep(fromStep(current) * factor)))} />

      {result ? (
        <div aria-live="polite" className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-amethyst/40 bg-amethyst/10 p-3">
              <p className="text-xs text-muted-foreground">Real {prompt.dimension}</p>
              <p className="text-2xl font-extrabold tabular-nums">{ratioText(result.actual)}</p>
            </div>
            <div className="rounded-xl border border-rose/40 bg-rose/10 p-3">
              <p className="text-xs text-muted-foreground">Your guess (dashed)</p>
              <p className="text-2xl font-extrabold tabular-nums">{ratioText(result.guess)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="text-2xl font-extrabold tabular-nums">
                {result.score}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </p>
            </div>
          </div>
          <p className="text-sm text-pretty">
            {prompt.subject.name} is {formatMeasure(result.subject.value, result.subject.unit)} and {prompt.reference.name} is {formatMeasure(result.reference.value, result.reference.unit)}, so {prompt.subject.name} is{" "}
            <span className="font-semibold">{ratioText(result.actual)}</span> the {prompt.dimension} of {prompt.reference.name}.
          </p>
          <p className="text-xs text-pretty text-muted-foreground">
            {result.note} Sources:{" "}
            {result.sources.map((source, i) => (
              <span key={source.url}>
                {i ? "; " : ""}
                {source.publisher},{" "}
                <a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-amethyst underline-offset-2 hover:underline">
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
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onGuess(ratio);
          }}
        >
          <div className="flex items-center justify-between gap-2 text-sm">
            <label htmlFor={sliderId} className="font-semibold">
              {prompt.subject.name}’s {prompt.dimension}
            </label>
            <span className="text-muted-foreground tabular-nums">
              {ratioText(ratio)} {prompt.reference.name}’s
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={() => nudge(1 / 1.03)} disabled={busy} aria-label="Smaller">
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
              className="h-11 w-full accent-[var(--amethyst)]"
            />
            <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={() => nudge(1.03)} disabled={busy} aria-label="Bigger">
              <Plus aria-hidden />
            </Button>
            <Button type="submit" size="lg" disabled={busy}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Reveal
            </Button>
          </div>
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

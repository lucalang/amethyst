"use client";

import "./guess-the.css";
import Link from "next/link";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ExternalLink, Info, LayoutGrid, Loader2, RotateCcw, Send, Shuffle, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiError, apiFetch } from "@/lib/api-client";
import { SCORING_RULE, chartVerdict, formatChartValue, type ChartPuzzle, type ChartResult } from "@/lib/minigames/guess-the";
import { cn } from "@/lib/utils";
import { GameShell, Stat, useArcade, useGameAchievementTracking } from "../game-shell";

/**
 * Guess the Chart: the server deals a real chart cut off part-way (only the years before the cutoff ever reach the
 * browser); the player draws one value per remaining year; the server scores the complete guess, saves the record
 * and only then sends the real continuation.
 */

const RECENT_KEY = "amethyst:guess-the:chart:recent:v1";
const RECENT_KEEP = 6;

type Guess = (number | null)[];
type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "drawing"; chart: ChartPuzzle }
  | { kind: "submitting"; chart: ChartPuzzle }
  | { kind: "revealed"; chart: ChartPuzzle; result: ChartResult; best: number; previousBest: number | null };

function readRecent(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string").slice(-RECENT_KEEP) : [];
  } catch {
    return [];
  }
}
function rememberChart(id: string) {
  try {
    const next = [...readRecent().filter((entry) => entry !== id), id].slice(-RECENT_KEEP);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Without storage, repeats are only avoided against the chart just played.
  }
}

const hiddenYears = (chart: ChartPuzzle) => Array.from({ length: chart.lastYear - chart.cutoff }, (_, i) => chart.cutoff + 1 + i);
const anchorValue = (chart: ChartPuzzle) => chart.visible[chart.visible.length - 1][1];
const clampValue = (chart: ChartPuzzle, value: number) => Math.min(chart.yDomain[1], Math.max(chart.yDomain[0], value));
/** Guesses are kept a little finer than the chart prints, which is plenty for drawing. */
const tidy = (chart: ChartPuzzle, value: number) => {
  const step = 10 ** -(chart.format.decimals + 1);
  return clampValue(chart, Math.round(value / step) * step);
};

/** Fills every undrawn year: straight lines between drawn years, and flat from the nearest one at the ends. */
function completeGuess(chart: ChartPuzzle, guess: Guess): number[] {
  const out = [...guess];
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] !== null) continue;
    let prev = i - 1;
    while (prev >= 0 && out[prev] === null) prev -= 1;
    let next = i + 1;
    while (next < out.length && guess[next] === null) next += 1;
    const from = prev >= 0 ? (out[prev] as number) : anchorValue(chart);
    if (next < out.length) {
      const to = guess[next] as number;
      out[i] = tidy(chart, from + ((to - from) * (i - prev)) / (next - prev));
    } else {
      out[i] = from;
    }
  }
  return out as number[];
}

function niceStep(span: number, target: number) {
  const raw = span / target;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = [1, 2, 2.5, 5, 10].find((candidate) => candidate * power >= raw) ?? 10;
  return unit * power;
}
function ticks(min: number, max: number, target: number) {
  const step = niceStep(max - min, target);
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max + step * 1e-6; value += step) out.push(Number(value.toFixed(6)));
  return out;
}
function yearTicks(first: number, last: number, target: number) {
  const step = [1, 2, 5, 10, 20, 25, 50].find((candidate) => (last - first) / candidate <= target) ?? 50;
  const out: number[] = [];
  for (let year = Math.ceil(first / step) * step; year <= last; year += step) out.push(year);
  return out;
}

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

function ChartPlot({
  chart,
  guess,
  onGuess,
  result,
  selected,
  onSelect,
  animate,
  describedBy,
}: {
  chart: ChartPuzzle;
  guess: Guess;
  onGuess?: (next: Guess) => void;
  result: ChartResult | null;
  selected: number;
  onSelect: (index: number) => void;
  animate: boolean;
  describedBy: string;
}) {
  const { ref, width } = useWidth();
  const drag = useRef<{ id: number; index: number } | null>(null);
  const [inspect, setInspect] = useState<number | null>(null);
  const drawing = Boolean(onGuess);
  const years = hiddenYears(chart);
  const narrow = width < 520;
  const height = Math.round(narrow ? Math.max(280, width * 0.92) : Math.min(470, Math.max(320, width * 0.5)));
  const pad = { left: narrow ? 44 : 56, right: narrow ? 14 : 22, top: 36, bottom: 30 };
  const plotW = Math.max(10, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const [yMin, yMax] = chart.yDomain;
  const x = (year: number) => pad.left + ((year - chart.firstYear) / (chart.lastYear - chart.firstYear)) * plotW;
  const y = (value: number) => pad.top + ((yMax - value) / (yMax - yMin)) * plotH;
  const valueAt = (py: number) => yMax - ((py - pad.top) / plotH) * (yMax - yMin);
  const anchor = { year: chart.cutoff, value: anchorValue(chart) };
  const fmt = (value: number) => formatChartValue(chart.format, value);

  function pointFrom(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const year = Math.round(chart.firstYear + ((px - pad.left) / plotW) * (chart.lastYear - chart.firstYear));
    return { index: Math.min(years.length - 1, Math.max(0, year - chart.cutoff - 1)), year, value: tidy(chart, valueAt(py)), px };
  }

  function paint(event: PointerEvent<SVGSVGElement>, from: number | null) {
    if (!onGuess) return;
    const point = pointFrom(event);
    const next = [...guess];
    next[point.index] = point.value;
    // A fast stroke skips years: fill the ones it passed over in a straight line.
    if (from !== null && from !== point.index) {
      const start = guess[from] ?? point.value;
      const step = point.index > from ? 1 : -1;
      for (let i = from + step; i !== point.index; i += step) {
        next[i] = tidy(chart, start + ((point.value - start) * (i - from)) / (point.index - from));
      }
    }
    onGuess(next);
    onSelect(point.index);
    return point.index;
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (!drawing || event.button !== 0) return;
    const point = pointFrom(event);
    // Strokes start in the blank part of the chart (a little leeway at the cutoff line).
    if (point.px < x(chart.cutoff) - 12) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus({ preventScroll: true });
    const index = paint(event, null);
    if (index !== undefined) drag.current = { id: event.pointerId, index };
  }
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!drawing) {
      const point = pointFrom(event);
      setInspect(point.year > chart.cutoff ? point.index : null);
      return;
    }
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    const index = paint(event, current.index);
    if (index !== undefined) drag.current = { id: current.id, index };
  }
  const endStroke = () => (drag.current = null);

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const span = yMax - yMin;
    const move = (index: number) => onSelect(Math.min(years.length - 1, Math.max(0, index)));
    switch (event.key) {
      case "ArrowLeft":
        move(selected - 1);
        break;
      case "ArrowRight":
        move(selected + 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(years.length - 1);
        break;
      case "ArrowUp":
      case "ArrowDown":
      case "PageUp":
      case "PageDown": {
        if (!onGuess) return;
        const big = event.key.startsWith("Page") || event.shiftKey;
        const sign = event.key === "ArrowUp" || event.key === "PageUp" ? 1 : -1;
        let base = guess[selected];
        if (base === null) {
          // An undrawn year starts from the nearest drawn year before it (or the last real value).
          let prev = selected - 1;
          while (prev >= 0 && guess[prev] === null) prev -= 1;
          base = prev >= 0 ? (guess[prev] as number) : anchor.value;
        }
        const next = [...guess];
        next[selected] = tidy(chart, base + sign * span * (big ? 0.05 : 0.01));
        onGuess(next);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
  }

  // Paths: the real history, the guess (broken where years are undrawn) and, after reveal, the real continuation.
  const history = chart.visible.map(([year, value], i) => `${i ? "L" : "M"}${x(year).toFixed(1)} ${y(value).toFixed(1)}`).join("");
  const historyArea = `${history}L${x(chart.cutoff).toFixed(1)} ${y(yMin).toFixed(1)}L${x(chart.firstYear).toFixed(1)} ${y(yMin).toFixed(1)}Z`;
  const guessSegments: string[] = [];
  let open = `M${x(anchor.year).toFixed(1)} ${y(anchor.value).toFixed(1)}`;
  let length = 0;
  guess.forEach((value, i) => {
    if (value === null) {
      if (length) guessSegments.push(open);
      open = "";
      length = 0;
      return;
    }
    open += `${open ? "L" : "M"}${x(years[i]).toFixed(1)} ${y(value).toFixed(1)}`;
    length += 1;
  });
  if (length) guessSegments.push(open);
  const actual = result ? [[anchor.year, anchor.value] as const, ...result.actual] : null;
  const actualPath = actual?.map(([year, value], i) => `${i ? "L" : "M"}${x(year).toFixed(1)} ${y(value).toFixed(1)}`).join("");
  const between =
    actual && guess.every((value) => value !== null)
      ? `M${x(anchor.year)} ${y(anchor.value)}${(guess as number[]).map((value, i) => `L${x(years[i]).toFixed(1)} ${y(value).toFixed(1)}`).join("")}${[...actual]
          .reverse()
          .map(([year, value]) => `L${x(year).toFixed(1)} ${y(value).toFixed(1)}`)
          .join("")}Z`
      : null;

  const yTickValues = ticks(yMin, yMax, narrow ? 4 : 5);
  const xTickValues = yearTicks(chart.firstYear, chart.lastYear, narrow ? 4 : 8);
  const drawn = guess.filter((value) => value !== null).length;
  const focusIndex = drawing ? selected : inspect;
  const focusYear = focusIndex === null ? null : years[focusIndex];

  const futureX = x(chart.cutoff);
  const futureW = x(chart.lastYear) - futureX;
  const lastGuess = guess[guess.length - 1];
  const lastActual = result ? result.actual[result.actual.length - 1][1] : null;
  // End labels on the right: keep the two apart when the lines finish close together.
  let actualLabelY = lastActual === null ? 0 : y(lastActual);
  let guessLabelY = lastGuess === null || lastGuess === undefined ? 0 : y(lastGuess);
  if (lastActual !== null && lastGuess !== null && lastGuess !== undefined && Math.abs(actualLabelY - guessLabelY) < 24) {
    const mid = (actualLabelY + guessLabelY) / 2;
    const up = actualLabelY <= guessLabelY ? -1 : 1;
    actualLabelY = mid + up * 12;
    guessLabelY = mid - up * 12;
  }

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 ? (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="gtc-plot block"
          data-drawing={drawing}
          tabIndex={0}
          role="application"
          aria-roledescription="chart you can draw on"
          aria-label={`${chart.title}, ${chart.firstYear} to ${chart.lastYear}. Shown up to ${chart.cutoff}: ${fmt(anchor.value)}. ${drawing ? `${drawn} of ${years.length} years drawn.` : ""}`}
          aria-describedby={describedBy}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => setInspect(null)}
          onKeyDown={onKeyDown}
        >
          <defs>
            <linearGradient id="gtc-history-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--amethyst)" stopOpacity="0.32" />
              <stop offset="100%" stopColor="var(--amethyst)" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gtc-future-fill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--rose)" stopOpacity="0.13" />
              <stop offset="100%" stopColor="var(--rose)" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Grid and axes. */}
          {yTickValues.map((value) => (
            <g key={value}>
              <line x1={pad.left} x2={pad.left + plotW} y1={y(value)} y2={y(value)} stroke="currentColor" strokeOpacity={value === 0 && yMin < 0 ? 0.32 : 0.08} strokeDasharray={value === 0 && yMin < 0 ? undefined : "2 4"} className="text-foreground" />
              <text x={pad.left - 9} y={y(value)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                {formatChartValue({ ...chart.format, decimals: Number.isInteger(value) ? 0 : Math.min(2, chart.format.decimals) }, value)}
              </text>
            </g>
          ))}
          {xTickValues.map((year) => (
            <g key={year}>
              <line x1={x(year)} x2={x(year)} y1={pad.top + plotH} y2={pad.top + plotH + 4} stroke="currentColor" strokeOpacity="0.3" className="text-foreground" />
              <text x={x(year)} y={height - 9} textAnchor="middle" className="fill-muted-foreground text-[11px] tabular-nums">
                {year}
              </text>
            </g>
          ))}
          <line x1={pad.left} x2={pad.left + plotW} y1={pad.top + plotH} y2={pad.top + plotH} stroke="currentColor" strokeOpacity="0.28" className="text-foreground" />

          {/* The part to draw, with the cutoff marked at the top. */}
          <rect x={futureX} y={pad.top} width={futureW} height={plotH} rx={6} fill="url(#gtc-future-fill)" />
          <line x1={futureX} x2={futureX} y1={pad.top - 6} y2={pad.top + plotH} stroke="currentColor" strokeOpacity="0.4" strokeDasharray="4 4" className="text-foreground" />
          <Pill x={futureX} y={pad.top - 20} text={result ? `Revealed after ${chart.cutoff}` : `Your turn after ${chart.cutoff}`} tone={result ? "sky" : "rose"} align={futureX + 150 > pad.left + plotW ? "end" : "start"} />

          {/* History. */}
          <path d={historyArea} fill="url(#gtc-history-fill)" />
          <path d={history} fill="none" stroke="var(--amethyst)" strokeOpacity="0.25" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" />
          <path d={history} fill="none" stroke="var(--amethyst)" strokeWidth={2.75} strokeLinejoin="round" strokeLinecap="round" />

          {/* After the reveal: the gap between guess and reality, then the real line. */}
          {between ? <path d={between} className={cn(animate && "gtc-reveal-fill")} fill="var(--rose)" fillOpacity="0.12" /> : null}
          {guessSegments.map((d, i) => (
            <g key={i}>
              {!result ? <path d={d} fill="none" stroke="var(--rose)" strokeOpacity="0.22" strokeWidth={8} strokeLinejoin="round" strokeLinecap="round" /> : null}
              <path d={d} fill="none" stroke="var(--rose)" strokeWidth={2.75} strokeDasharray={result ? "7 6" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ))}
          {!result
            ? guess.map((value, i) =>
                value === null ? null : <circle key={i} cx={x(years[i])} cy={y(value)} r={years.length > 24 ? 2.2 : 3} fill="var(--background)" stroke="var(--rose)" strokeWidth={1.75} />,
              )
            : null}
          {actualPath ? (
            <g>
              <path d={actualPath} pathLength={1} className={cn(animate && "gtc-reveal")} fill="none" stroke="var(--amethyst)" strokeOpacity="0.25" strokeWidth={9} strokeLinejoin="round" strokeLinecap="round" />
              <path d={actualPath} pathLength={1} className={cn(animate && "gtc-reveal")} fill="none" stroke="var(--amethyst)" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ) : null}

          {/* The last real value before the cutoff. */}
          <circle cx={x(anchor.year)} cy={y(anchor.value)} r={9} fill="var(--amethyst)" fillOpacity="0.2" />
          <circle cx={x(anchor.year)} cy={y(anchor.value)} r={4.5} fill="var(--amethyst)" stroke="var(--background)" strokeWidth={2} />
          {!result ? <Pill x={x(anchor.year) - 10} y={y(anchor.value) + (y(anchor.value) < pad.top + 30 ? 18 : -18)} text={`${chart.cutoff}: ${fmt(anchor.value)}`} tone="sky" align="end" /> : null}

          {/* End labels once revealed. */}
          {result && lastActual !== null ? (
            <g className={cn(animate && "gtc-reveal-fill")}>
              <circle cx={x(chart.lastYear)} cy={y(lastActual)} r={4.5} fill="var(--amethyst)" stroke="var(--background)" strokeWidth={2} />
              <Pill x={x(chart.lastYear) - 10} y={actualLabelY} text={`Actual ${fmt(lastActual)}`} tone="sky" align="end" />
              {lastGuess !== null && lastGuess !== undefined ? (
                <>
                  <circle cx={x(chart.lastYear)} cy={y(lastGuess)} r={4} fill="var(--background)" stroke="var(--rose)" strokeWidth={2} />
                  <Pill x={x(chart.lastYear) - 10} y={guessLabelY} text={`You ${fmt(lastGuess)}`} tone="rose" align="end" />
                </>
              ) : null}
            </g>
          ) : null}

          {focusYear !== null ? (
            <g pointerEvents="none">
              <line x1={x(focusYear)} x2={x(focusYear)} y1={pad.top} y2={pad.top + plotH} stroke="currentColor" strokeOpacity="0.35" className="text-foreground" />
              {guess[focusIndex!] !== null ? <circle cx={x(focusYear)} cy={y(guess[focusIndex!] as number)} r={6.5} fill="var(--rose)" fillOpacity="0.25" stroke="var(--rose)" strokeWidth={2} /> : null}
              {result ? <circle cx={x(focusYear)} cy={y(result.actual[focusIndex!][1])} r={5.5} fill="var(--amethyst)" stroke="var(--background)" strokeWidth={2} /> : null}
            </g>
          ) : null}

          {drawing && drawn === 0 ? (
            <g pointerEvents="none" className="gtc-hint">
              <text x={futureX + futureW / 2} y={pad.top + plotH / 2 - 6} textAnchor="middle" className="fill-foreground text-[15px] font-bold">
                Draw the rest
              </text>
              <text x={futureX + futureW / 2} y={pad.top + plotH / 2 + 14} textAnchor="middle" className="fill-muted-foreground text-[11.5px]">
                {chart.cutoff + 1} → {chart.lastYear}
              </text>
            </g>
          ) : null}
        </svg>
      ) : (
        <div style={{ height: 320 }} />
      )}
      <p aria-live="polite" className="mt-2 min-h-5 text-xs text-muted-foreground tabular-nums">
        {focusYear !== null ? (
          <>
            <span className="font-semibold text-foreground">{focusYear}</span>
            {result ? <> · actual <span className="font-semibold text-amethyst">{fmt(result.actual[focusIndex!][1])}</span></> : null}
            {" · "}your guess {guess[focusIndex!] === null ? "not drawn yet" : <span className="font-semibold text-rose">{fmt(guess[focusIndex!] as number)}</span>}
          </>
        ) : result ? (
          "Point at a year to compare your guess with what happened."
        ) : null}
      </p>
    </div>
  );
}

/** A small rounded label inside the chart. */
function Pill({ x, y, text, tone, align = "start" }: { x: number; y: number; text: string; tone: "sky" | "rose"; align?: "start" | "end" }) {
  const width = text.length * 6.3 + 16;
  const left = align === "end" ? x - width : x;
  const color = tone === "sky" ? "var(--amethyst)" : "var(--rose)";
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - 10} width={width} height={20} rx={10} fill="var(--background)" fillOpacity="0.92" stroke={color} strokeOpacity="0.55" />
      <text x={left + width / 2} y={y} dy="0.34em" textAnchor="middle" className="text-[11px] font-semibold tabular-nums" fill={color}>
        {text}
      </text>
    </g>
  );
}

/** The score as a ring that fills to it. */
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
          stroke="url(#gtc-ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - score / 100)}
          className={cn(animate && "gtc-ring")}
          style={{ "--gtc-ring-from": length } as CSSProperties}
        />
        <defs>
          <linearGradient id="gtc-ring" x1="0" y1="0" x2="1" y2="1">
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

function missText(chart: ChartPuzzle, result: ChartResult) {
  const miss = chart.format.suffix === "%" ? `${result.averageMiss.toFixed(chart.format.decimals)} percentage points` : formatChartValue(chart.format, result.averageMiss);
  return `On average you were ${miss} off, ${(result.missShare * 100).toFixed(1)}% of the chart’s height.`;
}

/** A chart the player hasn't seen lately. */
async function fetchChart() {
  const recent = readRecent();
  const { chart } = await apiFetch<{ chart: ChartPuzzle }>(`/api/arcade/guess-the/chart?recent=${encodeURIComponent(recent.join(","))}`);
  return chart;
}

export default function GuessTheChart({ best: initialBest }: { best: number | null }) {
  const { play, effects } = useArcade();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [guess, setGuess] = useState<Guess>([]);
  const [selected, setSelected] = useState(0);
  const [best, setBest] = useState<number | null>(initialBest);
  const [session, setSession] = useState({ rounds: 0, total: 0 });
  const helpId = useId();
  const loading = useRef(false);

  useGameAchievementTracking("guess-the", phase.kind === "drawing" ? "playing" : phase.kind);

  const show = useCallback((chart: ChartPuzzle) => {
    rememberChart(chart.id);
    setGuess(Array.from({ length: chart.lastYear - chart.cutoff }, () => null));
    setSelected(0);
    setPhase({ kind: "drawing", chart });
  }, []);
  const failed = useCallback(() => setPhase({ kind: "error", message: "Couldn’t load a chart. Check your connection and try again." }), []);

  const deal = () => {
    if (loading.current) return;
    loading.current = true;
    setPhase({ kind: "loading" });
    fetchChart()
      .then(show, failed)
      .finally(() => (loading.current = false));
  };

  useEffect(() => {
    // The first chart is dealt in the browser, where the list of recently played charts lives.
    let live = true;
    loading.current = true;
    fetchChart()
      .then((chart) => live && show(chart), () => live && failed())
      .finally(() => (loading.current = false));
    return () => {
      live = false;
    };
  }, [show, failed]);

  async function submit() {
    if (phase.kind !== "drawing" || guess.some((value) => value === null)) return;
    const chart = phase.chart;
    setPhase({ kind: "submitting", chart });
    play("tap");
    try {
      const body = await apiFetch<{ result: ChartResult; best: number }>("/api/arcade/guess-the/chart", { method: "POST", json: { id: chart.id, guesses: guess } });
      setPhase({ kind: "revealed", chart, result: body.result, best: body.best, previousBest: best });
      setBest(body.best);
      setSession((current) => ({ rounds: current.rounds + 1, total: current.total + body.result.score }));
      play(body.result.score >= 75 ? "win" : "reveal");
    } catch (error) {
      // The guess stays on the chart, ready to submit again.
      setPhase({ kind: "drawing", chart });
      toast.error(error instanceof ApiError ? error.message : "Couldn’t submit your guess. Try again.");
    }
  }

  const chart = phase.kind === "drawing" || phase.kind === "submitting" || phase.kind === "revealed" ? phase.chart : null;
  const result = phase.kind === "revealed" ? phase.result : null;
  const drawn = guess.filter((value) => value !== null).length;
  const complete = chart !== null && drawn === guess.length && guess.length > 0;
  const animate = effects !== "off";

  return (
    <GameShell
      game="guess-the"
      title="Guess the Chart"
      active={phase.kind === "drawing" && drawn > 0}
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
          <Stat label="Charts this visit" value={session.rounds} />
          <Stat label="Average" value={session.rounds ? Math.round(session.total / session.rounds) : "—"} />
        </>
      }
    >
      <div data-motion={effects} data-gt-mode="chart" className="flex flex-col gap-3">
        {phase.kind === "loading" ? (
          <div role="status" className="gtc-panel grid min-h-[24rem] place-items-center text-sm text-muted-foreground">
            <span className="flex flex-col items-center gap-3">
              <span aria-hidden className="gtc-loader" />
              Picking a chart…
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
        ) : chart ? (
          <>
            <section className="gtc-panel gt-card-hero gt-enter flex flex-col gap-3 p-3 sm:p-6">
              <header className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="gtc-chip gtc-chip-accent">{chart.topic}</span>
                  <span className="gtc-chip">{chart.firstYear}–{chart.lastYear}</span>
                  <span className="gtc-chip">{chart.unit}</span>
                </div>
                <h2 className="gt-display text-3xl text-balance sm:text-4xl">{chart.title}</h2>
                <p className="text-sm text-pretty text-muted-foreground">{chart.subtitle}</p>
              </header>

              <ChartPlot
                key={chart.id}
                chart={chart}
                guess={guess}
                onGuess={phase.kind === "drawing" ? setGuess : undefined}
                result={result}
                selected={selected}
                onSelect={setSelected}
                animate={animate}
                describedBy={helpId}
              />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-1 w-5 rounded-full bg-amethyst" />
                  Real data
                </span>
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="inline-block h-1 w-5 rounded-full bg-rose" />
                  Your guess
                </span>
              </div>
            </section>

            {result && phase.kind === "revealed" ? (
              <section aria-live="polite" className="gtc-panel gtc-score flex flex-col items-center gap-4 p-4 text-center sm:flex-row sm:text-left">
                <ScoreRing score={result.score} animate={animate} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center justify-center gap-2 text-lg font-extrabold tracking-tight sm:justify-start">
                    {chartVerdict(result.score)}
                    {phase.previousBest === null || result.score > phase.previousBest ? <span className="gtc-chip gtc-chip-rose">New best</span> : null}
                  </p>
                  <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{missText(chart, result)}</p>
                </div>
                <Button size="lg" className="gt-go h-12 rounded-full px-6 text-base" onClick={deal} ref={(element) => element?.focus({ preventScroll: true })}>
                  <Shuffle aria-hidden />
                  Another chart
                </Button>
              </section>
            ) : (
              <section className="gtc-panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-semibold">{complete ? "Your line is complete" : "Draw every year"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {drawn}/{guess.length} years
                    </span>
                  </p>
                  <div aria-hidden className="gtc-progress mt-1.5">
                    <span style={{ width: `${guess.length ? (drawn / guess.length) * 100 : 0}%` }} />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setGuess(completeGuess(chart, guess))} disabled={phase.kind !== "drawing" || complete} title="Join drawn years with straight lines and carry the line on flat to the end">
                    <Wand2 aria-hidden />
                    Complete line
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGuess(guess.map(() => null));
                      setSelected(0);
                    }}
                    disabled={phase.kind !== "drawing" || drawn === 0}
                  >
                    <RotateCcw aria-hidden />
                    Reset
                  </Button>
                  <Button size="sm" className="gt-go rounded-full px-4" onClick={() => void submit()} disabled={!complete || phase.kind !== "drawing"}>
                    {phase.kind === "submitting" ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
                    Reveal
                  </Button>
                </div>
              </section>
            )}

            <div className="grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
              <details className="gtc-panel group p-3" open={phase.kind === "drawing" && session.rounds === 0}>
                <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold text-foreground">
                  <Info aria-hidden className="size-3.5 text-amethyst" />
                  How to play and scoring
                </summary>
                <p id={helpId} className="mt-2 text-pretty">
                  Draw across the shaded part with your mouse or finger, one value per year from {chart.cutoff + 1} to {chart.lastYear}; draw over it again to change it. With a keyboard, focus the chart, pick a
                  year with ← and →, and set it with ↑ and ↓ (hold Shift for bigger steps). “Complete line” joins the years you drew and carries the line on to the end.
                </p>
                <p className="mt-2 text-pretty">{SCORING_RULE}</p>
              </details>
              <div className="gtc-panel p-3">
                <p className="text-pretty">
                  <span className="font-semibold text-foreground">Source:</span> {chart.source.publisher}. {chart.source.dataset}.{" "}
                  <a href={chart.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-amethyst underline-offset-2 hover:underline">
                    View the data
                    <ExternalLink aria-hidden className="size-3" />
                  </a>
                </p>
                <p className="mt-1.5 text-pretty">
                  {chart.firstYear}–{chart.lastYear}. {chart.source.note} A snapshot downloaded on {chart.source.retrieved}, not live data.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </GameShell>
  );
}

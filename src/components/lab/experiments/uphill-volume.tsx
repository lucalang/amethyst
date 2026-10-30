"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Triangle, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LabProps } from ".";

/** The hill, in SVG units: louder is further up the slope. */
const X0 = 50;
const Y0 = 175;
const X1 = 350;
const Y1 = 55;
const LENGTH = Math.hypot(X1 - X0, Y1 - Y0);
const NX = (Y1 - Y0) / LENGTH;
const NY = -(X1 - X0) / LENGTH;
const ROCK = 17;
/** Demo-only loudness ceiling, well below full scale, behind a compressor. */
const MAX_GAIN = 0.06;

/** A soft tone that follows the demo volume. It owns its own audio context and never touches app sound. */
function useDemoTone(level: number, on: boolean) {
  const audio = useRef<{ ctx: AudioContext; gain: GainNode; osc: OscillatorNode } | null>(null);
  useEffect(() => {
    if (!on) return;
    const ctx = new AudioContext();
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.connect(gain).connect(compressor).connect(ctx.destination);
    osc.start();
    audio.current = { ctx, gain, osc };
    return () => {
      audio.current = null;
      void ctx.close();
    };
  }, [on]);
  useEffect(() => {
    const current = audio.current;
    if (!current) return;
    current.gain.gain.setTargetAtTime(level * MAX_GAIN, current.ctx.currentTime, 0.05);
    current.osc.frequency.setTargetAtTime(160 + level * 280, current.ctx.currentTime, 0.05);
  }, [level, on]);
}

export function UphillVolume({ assist }: LabProps) {
  const [level, setLevel] = useState(0.35);
  const [chocked, setChocked] = useState(false);
  const [sound, setSound] = useState(false);
  const pos = useRef(0.35);
  const vel = useRef(0);
  const target = useRef<number | null>(null);
  const frame = useRef(0);
  const chockedRef = useRef(false);
  const svg = useRef<SVGSVGElement>(null);
  useDemoTone(level, sound);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function kick() {
    if (frame.current || assist) return;
    let last = 0;
    const tick = (now: number) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (target.current !== null) {
        // Pushing uphill is slow work; letting it roll down is easy.
        const k = target.current > pos.current ? 2.2 : 10;
        pos.current += (target.current - pos.current) * (1 - Math.exp(-k * dt));
        vel.current = 0;
      } else if (!chockedRef.current && pos.current > 0) {
        vel.current += 0.8 * dt;
        pos.current = Math.max(0, pos.current - vel.current * dt);
        if (pos.current === 0) vel.current = 0;
      }
      setLevel(pos.current);
      const busy = target.current !== null || (!chockedRef.current && pos.current > 0);
      frame.current = busy ? requestAnimationFrame(tick) : 0;
    };
    frame.current = requestAnimationFrame(tick);
  }

  function setChock(next: boolean) {
    chockedRef.current = next;
    setChocked(next);
    vel.current = 0;
    if (!next) kick();
  }

  function project(event: PointerEvent) {
    const rect = svg.current!.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 400;
    return Math.min(1, Math.max(0, (x - X0) / (X1 - X0)));
  }

  function onKeyDown(event: KeyboardEvent) {
    const step = { ArrowRight: 0.06, ArrowUp: 0.06, ArrowLeft: -0.06, ArrowDown: -0.06, PageUp: 0.2, PageDown: -0.2, Home: -1, End: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    pos.current = Math.min(1, Math.max(0, pos.current + step));
    vel.current = 0;
    setLevel(pos.current);
    kick();
  }

  // Rolling downhill starts on its own when the demo opens.
  useEffect(() => {
    if (!assist) kick();
    else {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assist]);

  const percent = Math.round(level * 100);
  const cx = X0 + (X1 - X0) * level + NX * ROCK;
  const cy = Y0 + (Y1 - Y0) * level + NY * ROCK;
  const message = assist
    ? "A perfectly ordinary slider. How dull."
    : chocked
      ? `Wedged at ${percent}%. Gravity is furious.`
      : percent === 0
        ? "Silence, as nature intended."
        : "Gravity is winning. Push harder, or wedge it.";

  return (
    <div className="space-y-5">
      {assist ? (
        <label className="block max-w-md space-y-2">
          <span className="text-sm font-medium">Demo volume</span>
          <input
            type="range"
            min={0}
            max={100}
            value={percent}
            onChange={(event) => {
              pos.current = Number(event.target.value) / 100;
              setLevel(pos.current);
            }}
            className="w-full accent-amethyst"
          />
        </label>
      ) : (
        <div
          role="slider"
          tabIndex={0}
          aria-label="Demo volume, on a hill"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={`${percent}%${chocked ? ", wedged" : ""}`}
          onKeyDown={onKeyDown}
          className="mx-auto max-w-xl touch-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            ref={svg}
            viewBox="0 0 400 210"
            className="w-full cursor-grab select-none active:cursor-grabbing"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              target.current = project(event);
              kick();
            }}
            onPointerMove={(event) => {
              if (target.current !== null) target.current = project(event);
            }}
            onPointerUp={() => {
              target.current = null;
            }}
            onPointerCancel={() => {
              target.current = null;
            }}
          >
            <path d={`M0,${Y0} H${X0} L${X1},${Y1} H400 V210 H0 Z`} className="fill-amethyst/15" />
            <path d={`M${X0},${Y0} L${X1},${Y1}`} className="stroke-amethyst/60" strokeWidth="3" strokeLinecap="round" />
            {[0.25, 0.5, 0.75].map((t) => (
              <circle key={t} cx={X0 + (X1 - X0) * t} cy={Y0 + (Y1 - Y0) * t} r="2.5" className="fill-amethyst/50" />
            ))}
            <text x={X0 - 6} y={Y0 + 22} className="fill-muted-foreground text-[11px]">
              hush
            </text>
            <path d={`M${X1},${Y1} v-34 l18,7 -18,7`} className="fill-amethyst stroke-amethyst" strokeWidth="1.5" />
            <text x={X1 - 34} y={Y1 + 22} className="fill-muted-foreground text-[11px]">
              LOUD
            </text>
            {chocked ? (
              <path
                d="M-10,0 L6,0 L6,-11 Z"
                transform={`translate(${cx - NX * ROCK - ((X1 - X0) / LENGTH) * 16} ${cy - NY * ROCK - ((Y1 - Y0) / LENGTH) * 16}) rotate(${(Math.atan2(Y1 - Y0, X1 - X0) * 180) / Math.PI})`}
                className="fill-amber-500"
              />
            ) : null}
            <g transform={`translate(${cx} ${cy}) rotate(${level * 760})`}>
              <circle r={ROCK} className="fill-foreground/80" />
              <circle r={ROCK - 4} className="fill-surface" />
              <path d="M-5,-4 h3 l5,-5 v18 l-5,-5 h-3 z" className="fill-foreground/80" />
              <path d="M6,-4 q3,4 0,8" className="fill-none stroke-foreground/80" strokeWidth="1.6" />
            </g>
          </svg>
        </div>
      )}

      <div className="mx-auto flex max-w-xl flex-wrap items-center justify-between gap-3">
        <div aria-live="polite" className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums">{percent}%</p>
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!assist ? (
            <button type="button" aria-pressed={chocked} onClick={() => setChock(!chocked)} className={cn("lab-control", chocked && "lab-control-on")}>
              <Triangle aria-hidden className="size-4" />
              {chocked ? "Remove wedge" : "Wedge it"}
            </button>
          ) : null}
          <button type="button" aria-pressed={sound} onClick={() => setSound((value) => !value)} className={cn("lab-control", sound && "lab-control-on")}>
            {sound ? <Volume2 aria-hidden className="size-4" /> : <VolumeX aria-hidden className="size-4" />}
            {sound ? "Mute demo tone" : "Play demo tone"}
          </button>
        </div>
      </div>
      <p className="mx-auto max-w-xl text-xs text-muted-foreground">
        Drag the rock uphill, or focus it and use the arrow keys. This volume only exists in this demo; the tone is quiet and off until you turn it on. Your device, Arcade and app sound are untouched.
      </p>
    </div>
  );
}

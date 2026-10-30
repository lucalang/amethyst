"use client";

import { useState } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { useMotionLevel } from "@/components/showcase/motion";
import { cn } from "@/lib/utils";
import type { LabProps } from ".";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const BITS = [16, 8, 4, 2, 1];

function roman(value: number) {
  const table: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let rest = value;
  let out = "";
  for (const [n, s] of table) while (rest >= n) {
    out += s;
    rest -= n;
  }
  return out;
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export function AwkwardDate({ assist }: LabProps) {
  const motion = useMotionLevel();
  const [year, setYear] = useState(2000);
  const [month, setMonth] = useState(0);
  const [turn, setTurn] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [day, setDay] = useState(1);
  const [plain, setPlain] = useState("");
  const max = daysIn(year, month);
  const valid = day >= 1 && day <= max;

  function spin() {
    const next = Math.floor(Math.random() * 12);
    // Wheel turns so the chosen month lands under the pointer at the top.
    const target = turn - (turn % 360) - 720 - next * 30;
    setTurn(target);
    setMonth(next);
    if (motion !== "off") {
      setSpinning(true);
      setTimeout(() => setSpinning(false), 2400);
    }
  }
  function nudge(by: number) {
    const next = (month + by + 12) % 12;
    setMonth(next);
    setTurn((value) => value - by * 30);
  }

  if (assist) {
    const date = plain ? new Date(`${plain}T00:00:00`) : null;
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <label htmlFor="plain-date" className="block text-sm font-medium">
          Date (the boring way)
        </label>
        <input
          id="plain-date"
          type="date"
          value={plain}
          onChange={(event) => setPlain(event.target.value)}
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p aria-live="polite" className="text-sm text-muted-foreground">
          {date && !Number.isNaN(date.getTime()) ? `That’s a ${date.toLocaleDateString(undefined, { weekday: "long" })}. Nothing is saved.` : "Pick any date; nothing is saved."}
        </p>
      </div>
    );
  }

  const shown = valid ? new Date(Date.UTC(year, month, day)) : null;

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <section aria-labelledby="ad-year" className="space-y-3 text-center">
        <h2 id="ad-year" className="text-sm font-semibold">
          Year
        </h2>
        <p className="font-serif text-2xl tracking-wide">{roman(year)}</p>
        <p className="text-xs text-muted-foreground">({year}, for the non-Romans)</p>
        <div className="flex justify-center gap-2">
          <button type="button" aria-label="One year earlier" onClick={() => setYear((value) => Math.max(1, value - 1))} className="lab-control">
            <Minus aria-hidden className="size-4" />
          </button>
          <button type="button" aria-label="One year later" onClick={() => setYear((value) => Math.min(3999, value + 1))} className="lab-control">
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">One year at a time. Builds character.</p>
      </section>

      <section aria-labelledby="ad-month" className="space-y-3 text-center">
        <h2 id="ad-month" className="text-sm font-semibold">
          Month
        </h2>
        <div className="relative mx-auto size-44">
          <span aria-hidden className="absolute top-[-6px] left-1/2 z-10 -translate-x-1/2 border-x-[7px] border-t-[10px] border-x-transparent border-t-amethyst" />
          <div
            aria-hidden
            className={cn("relative size-full rounded-full border-4 border-amethyst/40 bg-surface", spinning ? "transition-transform duration-[2400ms] ease-[cubic-bezier(.12,.7,.2,1)]" : "transition-transform duration-200")}
            style={{ transform: `rotate(${turn}deg)` }}
          >
            {MONTHS.map((name, index) => (
              <span
                key={name}
                className={cn("absolute top-1/2 left-1/2 origin-left text-[10px] font-medium", index % 2 ? "text-muted-foreground" : "text-foreground")}
                style={{ transform: `rotate(${index * 30 - 90}deg) translateX(46px)` }}
              >
                {name.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
        <p aria-live="polite" className="text-sm font-medium">
          {spinning ? "Spinning…" : MONTHS[month]}
        </p>
        <div className="flex justify-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => nudge(-1)} disabled={spinning} className="lab-control">
            <Minus aria-hidden className="size-4" />
          </button>
          <button type="button" onClick={spin} disabled={spinning} className="lab-control">
            <RefreshCw aria-hidden className="size-4" />
            Spin
          </button>
          <button type="button" aria-label="Next month" onClick={() => nudge(1)} disabled={spinning} className="lab-control">
            <Plus aria-hidden className="size-4" />
          </button>
        </div>
      </section>

      <section aria-labelledby="ad-day" className="space-y-3 text-center">
        <h2 id="ad-day" className="text-sm font-semibold">
          Day, in binary
        </h2>
        <div role="group" aria-labelledby="ad-day" className="flex justify-center gap-1.5">
          {BITS.map((bit) => {
            const on = (day & bit) !== 0;
            return (
              <button
                key={bit}
                type="button"
                aria-pressed={on}
                aria-label={`${bit}`}
                onClick={() => setDay((value) => value ^ bit)}
                className={cn("grid size-10 place-items-center rounded-lg border font-mono text-lg outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-amethyst bg-amethyst text-white" : "border-border")}
              >
                {on ? 1 : 0}
              </button>
            );
          })}
        </div>
        <p className="font-mono text-xs text-muted-foreground">16 · 8 · 4 · 2 · 1</p>
        <p className="text-sm">
          = <strong className="tabular-nums">{day}</strong>
          {!valid ? <span className="text-destructive">{day === 0 ? " (day zero isn’t a thing)" : ` (${MONTHS[month]} only has ${max} days)`}</span> : null}
        </p>
      </section>

      <p aria-live="polite" className="rounded-xl border border-border bg-background/40 p-3 text-center text-sm md:col-span-3">
        {shown
          ? `Selected: ${shown.toLocaleDateString(undefined, { dateStyle: "long", timeZone: "UTC" })}, a ${shown.toLocaleDateString(undefined, { weekday: "long", timeZone: "UTC" })}. Nothing is saved.`
          : "That day doesn’t exist yet. Flip some bits."}
      </p>
    </div>
  );
}

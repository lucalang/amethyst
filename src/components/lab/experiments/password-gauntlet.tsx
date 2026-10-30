"use client";

import { useMemo, useState } from "react";
import { Check, Scissors, ShieldAlert, Wand2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LabProps } from ".";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

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
const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i += 1) if (n % i === 0) return false;
  return true;
};
const digitSum = (text: string) => [...text].reduce((sum, char) => sum + (/\d/.test(char) ? Number(char) : 0), 0);

function makeRules(now: Date) {
  const weekday = WEEKDAYS[now.getDay()];
  const year = roman(now.getFullYear());
  return [
    { text: "At least 6 characters.", ok: (p: string) => p.length >= 6 },
    { text: "Include a number.", ok: (p: string) => /\d/.test(p) },
    { text: "Include an uppercase letter.", ok: (p: string) => /[A-Z]/.test(p) },
    { text: "The digits must add up to 12.", ok: (p: string) => digitSum(p) === 12 },
    { text: "Include a month of the year, spelled out.", ok: (p: string) => MONTHS.some((m) => p.toLowerCase().includes(m)) },
    { text: "Include the word “amethyst”. It’s only polite.", ok: (p: string) => p.toLowerCase().includes("amethyst") },
    { text: `Include today’s weekday (it’s ${weekday[0].toUpperCase()}${weekday.slice(1)}).`, ok: (p: string) => p.toLowerCase().includes(weekday) },
    { text: `Include this year in Roman numerals (${year}).`, ok: (p: string) => p.includes(year) },
    { text: "Include “please”.", ok: (p: string) => p.toLowerCase().includes("please") },
    { text: "The total length must be a prime number.", ok: (p: string) => isPrime(p.length) },
  ];
}

function example(now: Date) {
  let text = `Please39May${WEEKDAYS[now.getDay()]}amethyst${roman(now.getFullYear())}`;
  while (!isPrime(text.length)) text += "!";
  return text;
}

/** A pretend password field. Plain text on purpose, never stored, never sent. */
export function PasswordGauntlet({ assist }: LabProps) {
  const [value, setValue] = useState("");
  const [shredded, setShredded] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const rules = useMemo(() => makeRules(new Date()), []);
  const results = rules.map((rule) => rule.ok(value));
  const firstFail = results.indexOf(false);
  const done = firstFail === -1;
  // Rules appear one at a time, like a bureaucrat remembering them; easy mode shows them all.
  const visible = assist || skipped ? rules.length : done ? rules.length : firstFail + 1;

  function shred() {
    setValue("");
    setShredded(true);
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
        <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-500" />
        Don’t type a real password. This is a pretend one: it stays in this tab, is shown in plain text, and is never saved or sent.
      </p>
      <div className="space-y-1.5">
        <label htmlFor="gauntlet-input" className="text-sm font-medium">
          Make up a pretend password
        </label>
        <input
          id="gauntlet-input"
          name="lab-pretend-text"
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setShredded(false);
          }}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          maxLength={200}
          className="h-11 w-full rounded-lg border border-border bg-background px-3 font-mono text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <p className="text-xs text-muted-foreground tabular-nums">{value.length} characters</p>
      </div>

      <ol aria-live="polite" className="space-y-1.5">
        {rules.slice(0, visible).map((rule, index) => (
          <li
            key={rule.text}
            className={cn(
              "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
              results[index] ? "border-emerald-500/30 bg-emerald-500/5" : "border-destructive/40 bg-destructive/5",
            )}
          >
            {results[index] ? <Check aria-label="Met" className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <X aria-label="Not met" className="mt-0.5 size-4 shrink-0 text-destructive" />}
            <span>
              <span className="text-muted-foreground">Rule {index + 1}.</span> {rule.text}
            </span>
          </li>
        ))}
      </ol>

      <p aria-live="polite" className="min-h-5 text-sm font-medium">
        {done ? "Password accepted. It is magnificent. Now please shred it." : shredded ? "Shredded. Not a single character survived." : skipped ? "Skipped. These are all the rules; no password required." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={shred} className="lab-control">
          <Scissors aria-hidden className="size-4" />
          Shred it
        </button>
        {assist ? (
          <button type="button" onClick={() => setValue(example(new Date()))} className="lab-control">
            <Wand2 aria-hidden className="size-4" />
            Fill an example
          </button>
        ) : null}
        {!done && !skipped ? (
          <button type="button" onClick={() => setSkipped(true)} className="lab-control">
            Skip: show me every rule
          </button>
        ) : null}
      </div>
    </div>
  );
}

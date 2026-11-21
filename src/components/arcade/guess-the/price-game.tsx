"use client";

import { useId, useState } from "react";
import { Blocks, Bone, Cpu, ExternalLink, Gamepad2, Glasses, IdCard, Loader2, Mail, Milestone, Music, Palette, Send, Shirt, Smartphone, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice, type PriceIcon, type PriceResult } from "@/lib/minigames/guess-the";
import { CountUp, promptVerdict, toneOf } from "./fx";
import { RoundGame, type PlayProps } from "./round-game";

const ICONS: Record<PriceIcon, LucideIcon> = {
  phone: Smartphone,
  console: Gamepad2,
  headset: Glasses,
  board: Cpu,
  painting: Palette,
  stamp: Mail,
  dinosaur: Bone,
  jersey: Shirt,
  bricks: Blocks,
  card: IdCard,
  road: Milestone,
  music: Music,
};

const SCALES = [
  { id: "one", label: "×1", factor: 1 },
  { id: "thousand", label: "thousand", factor: 1e3 },
  { id: "million", label: "million", factor: 1e6 },
] as const;
const SYMBOL = { USD: "$", GBP: "£", CHF: "CHF" } as const;

/** Reads "1,299.99", "1 299,5" or "7.25" (with the chosen scale applied); null when it isn't a positive number. */
function parseAmount(text: string, factor: number) {
  let cleaned = text.replace(/[\s’'_]/g, "");
  // A lone comma followed by one or two digits is a decimal comma; other commas group thousands.
  if (/^\d+,\d{1,2}$/.test(cleaned)) cleaned = cleaned.replace(",", ".");
  cleaned = cleaned.replace(/,/g, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const value = Number(cleaned) * factor;
  return value > 0 && Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

/** How far off, in words: "spot on", "2.4× too high", "35% too low". */
function offText(result: PriceResult) {
  const factor = result.guess / result.actual;
  if (Math.abs(factor - 1) < 0.03) return "Spot on";
  if (factor >= 1.5) return `${factor.toFixed(1)}× too high`;
  if (factor <= 1 / 1.5) return `${(1 / factor).toFixed(1)}× too low`;
  return factor > 1 ? `${Math.round((factor - 1) * 100)}% too high` : `${Math.round((1 - factor) * 100)}% too low`;
}

/** Too low ← spot on → too high, on a log scale (8× either way at the ends). */
function Meter({ result }: { result: PriceResult }) {
  const position = Math.min(100, Math.max(0, 50 + (Math.log2(result.guess / result.actual) / 3) * 50));
  return (
    <div className="gt-meter" aria-hidden>
      <div className="gt-meter-track" />
      <div className="gt-meter-mark" style={{ left: "50%", ["--mark" as string]: "var(--foreground)" }}>
        <span>Real</span>
      </div>
      <div className="gt-meter-mark" style={{ left: `${position}%`, ["--mark" as string]: "#f472b6", transition: "left 0.8s cubic-bezier(0.2, 0.8, 0.3, 1)" }}>
        <span>You</span>
      </div>
      <span className="absolute top-0 left-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Too low</span>
      <span className="absolute top-0 right-0 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Too high</span>
    </div>
  );
}

function PricePlay({ prompt, result, busy, onGuess, animate }: PlayProps<"price">) {
  const [typed, setTyped] = useState("");
  const [scale, setScale] = useState<(typeof SCALES)[number]["id"]>("one");
  const inputId = useId();
  const Icon = ICONS[prompt.icon];
  const factor = SCALES.find((entry) => entry.id === scale)!.factor;
  const amount = parseAmount(typed, factor);
  return (
    <section className="gt-card gt-card-hero flex flex-col gap-5 p-4 sm:p-7">
      <div className="gt-tag flex items-center gap-4">
        <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--gt-a)] to-[var(--gt-b)] text-[#08091a] shadow-[0_12px_30px_-10px_rgb(var(--gt-a-rgb)/0.9)] sm:size-20">
          <Icon className="size-8 sm:size-10" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="gt-chip gt-chip-accent">{prompt.kind}</span>
            <span className="gt-chip">in {prompt.currency}</span>
          </div>
          <h2 className="gt-display mt-2 text-2xl text-balance sm:text-3xl">{prompt.name}</h2>
          <p className="mt-1.5 text-sm text-pretty text-muted-foreground">{prompt.detail}</p>
        </div>
      </div>

      {result ? (
        <div aria-live="polite" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span data-tone={toneOf(result.score)} className="gt-verdict">
              {promptVerdict(result.score)} · {offText(result)}
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
              <p>Real price</p>
              <p className="gt-till text-4xl!">
                <CountUp value={result.actual} animate={animate} duration={1100} format={(n) => formatPrice(prompt.currency, n >= result.actual * 0.999 ? result.actual : n)} />
              </p>
            </div>
            <div className="gt-tile gt-tile-guess">
              <p>Your guess</p>
              <p className="gt-till text-4xl!">{formatPrice(prompt.currency, result.guess)}</p>
            </div>
          </div>
          <Meter result={result} />
          <p className="text-xs text-pretty text-muted-foreground">
            {result.note} Price as of {result.date}. Source: {result.source.publisher},{" "}
            <a href={result.source.url} target="_blank" rel="noopener noreferrer" className="gt-link">
              {result.source.title}
              <ExternalLink aria-hidden className="size-3" />
            </a>
            .
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (amount !== null) onGuess(amount);
          }}
        >
          <label htmlFor={inputId} className="gt-kicker">
            Your price
          </label>
          <div className="flex items-center gap-2">
            <span aria-hidden className="gt-till text-3xl text-[var(--gt-a)]">
              {SYMBOL[prompt.currency]}
            </span>
            <input
              id={inputId}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              inputMode="decimal"
              autoComplete="off"
              enterKeyHint="go"
              placeholder="0"
              autoFocus
              disabled={busy}
              className="gt-field gt-till w-full text-3xl!"
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div role="radiogroup" aria-label="Amount in" className="gt-scale flex-1">
              {SCALES.map((entry) => (
                <button key={entry.id} type="button" role="radio" aria-checked={scale === entry.id} onClick={() => setScale(entry.id)}>
                  {entry.label}
                </button>
              ))}
            </div>
            <Button type="submit" size="lg" className="gt-go h-12 rounded-full px-6 text-base" disabled={busy || amount === null}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Lock it in
            </Button>
          </div>
          <p className="min-h-4 text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {amount !== null ? (
              <>
                You’re guessing <span className="font-bold text-foreground">{formatPrice(prompt.currency, amount)}</span>
              </>
            ) : typed ? (
              "Type a number, like 1299 or 7.25."
            ) : (
              "Big number? Pick “thousand” or “million” and type just the start, like 7.25."
            )}
          </p>
        </form>
      )}
    </section>
  );
}

export default function GuessThePrice({ best }: { best: number | null }) {
  return (
    <RoundGame
      mode="price"
      title="Guess the Price"
      best={best}
      noun="price"
      howTo={
        <p>
          Read exactly what’s being priced (model, market and date), type your guess and press Enter or “Lock it in”. For big numbers, pick “thousand” or “million” and type just the leading part, like 7.25 million. Every price is
          real and its source is linked with the answer.
        </p>
      }
      Play={PricePlay}
      summary={(prompt, result) => (
        <span className="flex flex-col">
          <span className="font-semibold">{prompt.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatPrice(prompt.currency, result.actual)} · you said {formatPrice(prompt.currency, result.guess)}
          </span>
        </span>
      )}
    />
  );
}

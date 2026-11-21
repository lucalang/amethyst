"use client";

import { useId, useState } from "react";
import { Blocks, Bone, Cpu, ExternalLink, Gamepad2, Glasses, IdCard, Loader2, Mail, Milestone, Music, Palette, Send, Shirt, Smartphone, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice, type PriceIcon } from "@/lib/minigames/guess-the";
import { cn } from "@/lib/utils";
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
  { id: "one", label: "—", factor: 1 },
  { id: "thousand", label: "thousand", factor: 1e3 },
  { id: "million", label: "million", factor: 1e6 },
] as const;

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

function PricePlay({ prompt, result, busy, onGuess }: PlayProps<"price">) {
  const [typed, setTyped] = useState("");
  const [scale, setScale] = useState<(typeof SCALES)[number]["id"]>("one");
  const inputId = useId();
  const Icon = ICONS[prompt.icon];
  const factor = SCALES.find((entry) => entry.id === scale)!.factor;
  const amount = parseAmount(typed, factor);
  return (
    <section className="gtc-panel flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid size-14 shrink-0 place-items-center rounded-2xl bg-amethyst/15 text-amethyst sm:size-16">
          <Icon className="size-7 sm:size-8" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <span className="gtc-chip gtc-chip-accent">{prompt.kind}</span>
            <span className="gtc-chip">Price in {prompt.currency}</span>
          </div>
          <h2 className="mt-1.5 text-xl leading-tight font-extrabold tracking-tight text-balance sm:text-2xl">{prompt.name}</h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{prompt.detail}</p>
        </div>
      </div>

      {result ? (
        <div aria-live="polite" className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-amethyst/40 bg-amethyst/10 p-3">
              <p className="text-xs text-muted-foreground">Real price</p>
              <p className="text-2xl font-extrabold tabular-nums">{formatPrice(prompt.currency, result.actual)}</p>
            </div>
            <div className="rounded-xl border border-rose/40 bg-rose/10 p-3">
              <p className="text-xs text-muted-foreground">Your guess</p>
              <p className="text-2xl font-extrabold tabular-nums">{formatPrice(prompt.currency, result.guess)}</p>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="text-2xl font-extrabold tabular-nums">
                {result.score}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </p>
            </div>
          </div>
          <p className="text-xs text-pretty text-muted-foreground">
            {result.note} Price as of {result.date}. Source: {result.source.publisher},{" "}
            <a href={result.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-medium text-amethyst underline-offset-2 hover:underline">
              {result.source.title}
              <ExternalLink aria-hidden className="size-3" />
            </a>
            .
          </p>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (amount !== null) onGuess(amount);
          }}
        >
          <label htmlFor={inputId} className="text-sm font-semibold">
            Your guess, in {prompt.currency}
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex flex-1 items-center gap-2">
              <span aria-hidden className="text-lg font-bold text-muted-foreground">
                {prompt.currency === "USD" ? "$" : prompt.currency === "GBP" ? "£" : "CHF"}
              </span>
              <Input id={inputId} value={typed} onChange={(event) => setTyped(event.target.value)} inputMode="decimal" autoComplete="off" enterKeyHint="go" placeholder="e.g. 250" autoFocus disabled={busy} className="h-11 text-base tabular-nums" />
            </div>
            <div role="radiogroup" aria-label="Amount in" className="flex rounded-lg border border-border p-0.5">
              {SCALES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={scale === entry.id}
                  onClick={() => setScale(entry.id)}
                  className={cn("flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none", scale === entry.id ? "bg-amethyst text-amethyst-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {entry.id === "one" ? <span aria-label="units">×1</span> : entry.label}
                </button>
              ))}
            </div>
            <Button type="submit" size="lg" disabled={busy || amount === null}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Guess
            </Button>
          </div>
          <p className="min-h-4 text-xs text-muted-foreground tabular-nums" aria-live="polite">
            {amount !== null ? `You’re guessing ${formatPrice(prompt.currency, amount)}.` : typed ? "Type a number, like 1299 or 7.25." : ""}
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
          Read what exactly is being priced (model, market and date), type your guess and press Enter or Guess. For big numbers, pick “thousand” or “million” and type just the leading part, like 7.25 million. Every price is real and
          sourced; the source is linked with the answer.
        </p>
      }
      Play={PricePlay}
      summary={(prompt, result) => (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{prompt.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatPrice(prompt.currency, result.actual)} · you said {formatPrice(prompt.currency, result.guess)}
          </span>
        </span>
      )}
    />
  );
}

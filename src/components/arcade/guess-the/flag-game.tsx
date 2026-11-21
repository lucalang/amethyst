"use client";

import { useState } from "react";
import { Check, Loader2, Send, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RoundGame, type PlayProps } from "./round-game";

/** Guess the Flag: a flag, a text box, then the answer. */
function FlagPlay({ prompt, result, guess, busy, onGuess }: PlayProps<"flag">) {
  const [typed, setTyped] = useState("");
  const revealed = result !== null;
  return (
    <section className="gtc-panel flex flex-col items-center gap-4 p-4 sm:p-6">
      <h2 className="text-lg font-extrabold tracking-tight">Which country’s flag is this?</h2>
      {/* The artwork comes as an SVG data URI from the server, so an <img> is all it needs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={prompt.image} alt="A country’s flag" width={320} height={240} className="aspect-[4/3] w-full max-w-xs rounded-md object-cover shadow-[0_0_0_1px_rgb(var(--ink-rgb)/0.18),0_14px_30px_-16px_rgb(0_0_0/0.8)] sm:max-w-sm" draggable={false} />
      {revealed ? (
        <div aria-live="polite" className={cn("flex w-full max-w-sm flex-col items-center gap-1 rounded-xl border p-3 text-center", result.correct ? "border-emerald-400/50 bg-emerald-400/10" : "border-rose/50 bg-rose/10")}>
          <p className="flex items-center gap-1.5 text-base font-bold">
            {result.correct ? <Check aria-hidden className="size-4 text-emerald-400" /> : <X aria-hidden className="size-4 text-rose" />}
            {result.correct ? "Correct!" : "Not quite"}
          </p>
          <p className="text-sm">
            It’s <span className="font-bold">{result.answer}</span>.
          </p>
          <p className="text-xs text-muted-foreground">
            {typeof guess === "string" && guess.trim() ? <>You wrote “{guess.trim()}”{result.matched ? `, read as “${result.matched}”` : ""}.</> : "You skipped this one."}
          </p>
        </div>
      ) : (
        <form
          className="flex w-full max-w-sm flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed.trim()) onGuess(typed);
          }}
        >
          <label htmlFor={`flag-${prompt.id}`} className="sr-only">
            Country name
          </label>
          <Input
            id={`flag-${prompt.id}`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type the country"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={80}
            autoFocus
            disabled={busy}
            className="h-11 text-base"
          />
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="flex-1" disabled={busy || !typed.trim()}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Guess
            </Button>
            <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => onGuess("")} title="Skip and see the answer">
              <SkipForward aria-hidden />
              <span className="sm:sr-only">Skip</span>
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

export default function GuessTheFlag({ best }: { best: number | null }) {
  return (
    <RoundGame
      mode="flag"
      title="Guess the Flag"
      best={best}
      noun="flag"
      howTo={<p>Type the name of the country whose flag is shown and press Enter or Guess. Don’t know it? Skip to see the answer. The answer is shown after every flag.</p>}
      Play={FlagPlay}
      summary={(_, result, guess) => (
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-semibold">{result.answer}</span>
          <span className="truncate text-xs text-muted-foreground">{typeof guess === "string" && guess.trim() ? `you wrote “${guess.trim()}”` : "skipped"}</span>
        </span>
      )}
    />
  );
}

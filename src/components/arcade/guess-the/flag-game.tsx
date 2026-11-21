"use client";

import { useState } from "react";
import { Check, Loader2, Send, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RoundGame, type PlayProps } from "./round-game";

/** Guess the Flag: a waving flag, an answer board, then the reveal. */
function FlagPlay({ prompt, result, guess, busy, onGuess }: PlayProps<"flag">) {
  const [typed, setTyped] = useState("");
  const revealed = result !== null;
  const typedGuess = typeof guess === "string" ? guess.trim() : "";
  return (
    <section className="gt-card gt-card-hero flex flex-col items-center gap-6 px-4 pt-7 pb-6 sm:px-8 sm:pt-9">
      <h2 className="gt-display text-center text-3xl sm:text-4xl">
        Whose flag <span className="gt-gradient-text">is this?</span>
      </h2>

      <div className="gt-flag-frame mx-auto">
        <span aria-hidden className="gt-flag-pole" />
        <div className="gt-flag" data-revealed={revealed || undefined}>
          {/* The artwork is an SVG data URI from the server, so a plain <img> is all it needs. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={prompt.image} alt={revealed ? `The flag of ${result.answer}` : "A country’s flag"} width={352} height={264} draggable={false} />
        </div>
      </div>

      {revealed ? (
        <div aria-live="polite" data-tone={result.correct ? "good" : "bad"} className={cn("gt-answer flex w-full max-w-md flex-col items-center gap-2", result.correct ? "gt-pop" : "gt-shake")}>
          <span className="gt-verdict">
            {result.correct ? <Check aria-hidden className="size-4" /> : <X aria-hidden className="size-4" />}
            {result.correct ? `+${result.score} Correct!` : typedGuess ? "Not this time" : "Skipped"}
          </span>
          <p className="gt-display text-3xl sm:text-4xl">{result.answer}</p>
          <p className="text-xs text-muted-foreground">
            {typedGuess ? (
              <>
                You wrote “{typedGuess}”{result.matched ? <>, close enough to “{result.matched}”</> : null}.
              </>
            ) : (
              "No guess this time."
            )}
          </p>
        </div>
      ) : (
        <form
          className="flex w-full max-w-md flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed.trim()) onGuess(typed);
          }}
        >
          <label htmlFor={`flag-${prompt.id}`} className="sr-only">
            Country name
          </label>
          <input
            id={`flag-${prompt.id}`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder="Type a country…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoCapitalize="words"
            enterKeyHint="go"
            maxLength={80}
            autoFocus
            disabled={busy}
            className="gt-field w-full text-center"
          />
          <div className="flex gap-2">
            <Button type="submit" size="lg" className="gt-go h-12 flex-1 rounded-full text-base" disabled={busy || !typed.trim()}>
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Send aria-hidden />}
              Lock it in
            </Button>
            <Button type="button" size="lg" variant="ghost" className="h-12 rounded-full" disabled={busy} onClick={() => onGuess("")} title="Skip and see the answer">
              <SkipForward aria-hidden />
              Skip
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
      howTo={<p>Type the name of the country whose flag is flying and press Enter or “Lock it in”. Don’t know it? Skip to see the answer. The answer is shown after every flag.</p>}
      Play={FlagPlay}
      summary={(_, result, guess) => (
        <span className="flex flex-col">
          <span className="font-semibold">{result.answer}</span>
          <span className="truncate text-xs text-muted-foreground">{typeof guess === "string" && guess.trim() ? `you wrote “${guess.trim()}”` : "skipped"}</span>
        </span>
      )}
    />
  );
}

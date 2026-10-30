"use client";

import { useState } from "react";
import { Check, FastForward } from "lucide-react";
import type { LabProps } from ".";

const SUBSCRIPTIONS = [
  { id: "air", name: "Premium Air", detail: "Breathing, now with 4% more oxygen.", price: "€0.00 / breath" },
  { id: "socks", name: "Socks Monthly+", detail: "One left sock a month. Right socks sold separately.", price: "€9.99 / foot" },
  { id: "clouds", name: "Cloud Storage for Clouds", detail: "A safe place for cumulus, stratus and the occasional nimbus.", price: "3 raindrops / month" },
] as const;
type SubId = (typeof SUBSCRIPTIONS)[number]["id"];

const REASONS = ["It’s too good and that scares me", "I found a cheaper version of air", "My socks achieved sentience", "I prefer my clouds unstored", "Other (we’ll pretend to read it)"];
const PAUSES = ["1 week", "1 month", "1 fiscal eon", "Until the heat death of the universe"];
const STEPS = ["sure", "reason", "offer", "pause", "type", "done"] as const;
type Step = (typeof STEPS)[number];

export function CancelMaze({ assist }: LabProps) {
  const [cancelled, setCancelled] = useState<SubId[]>([]);
  const [active, setActive] = useState<SubId | null>(null);
  const [step, setStep] = useState<Step>("sure");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  const sub = SUBSCRIPTIONS.find((item) => item.id === active);

  function start(id: SubId) {
    if (assist) {
      setCancelled((list) => [...list, id]);
      setNote(`${SUBSCRIPTIONS.find((item) => item.id === id)!.name} cancelled in one click. Refreshing, isn’t it?`);
      return;
    }
    setActive(id);
    setStep("sure");
    setReason("");
    setTyped("");
    setNote("");
  }
  function keep(message: string) {
    setActive(null);
    setNote(message);
  }
  function finish() {
    if (active && !cancelled.includes(active)) setCancelled((list) => [...list, active]);
    setStep("done");
  }

  if (sub) {
    const index = STEPS.indexOf(step);
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Cancelling <strong className="text-foreground">{sub.name}</strong> (pretend)
          </span>
          <span className="tabular-nums">Step {Math.min(index + 1, 5)} of 5ish</span>
        </div>
        <div aria-live="polite" className="rounded-xl border border-border bg-background/40 p-5">
          {step === "sure" ? (
            <>
              <h2 className="text-lg font-semibold">Are you absolutely, positively sure?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Think of everything you’d lose. Mostly nothing, but think of it anyway.</p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => keep(`${sub.name} stays. (It was never real.)`)} className="h-12 rounded-xl bg-amethyst text-base font-semibold text-white">
                  Keep my wonderful benefits
                </button>
                <button type="button" onClick={() => setStep("reason")} className="self-center text-xs text-muted-foreground underline">
                  continue cancelling, I suppose
                </button>
              </div>
            </>
          ) : step === "reason" ? (
            <>
              <h2 className="text-lg font-semibold">Help us understand your betrayal</h2>
              <fieldset className="mt-3 space-y-1.5">
                <legend className="sr-only">Reason for leaving</legend>
                {REASONS.map((option) => (
                  <label key={option} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="reason" value={option} checked={reason === option} onChange={() => setReason(option)} className="accent-amethyst" />
                    {option}
                  </label>
                ))}
              </fieldset>
              <button type="button" disabled={!reason} onClick={() => setStep("offer")} className="lab-control mt-4">
                Submit feelings
              </button>
            </>
          ) : step === "offer" ? (
            <>
              <h2 className="text-lg font-semibold">Wait! A once-in-a-lifetime offer</h2>
              <p className="mt-1 text-sm text-muted-foreground">99% off, forever-ish. That’s practically free, if you squint at it from orbit.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => keep("Offer accepted! Nothing was charged, because none of this exists.")} className="h-10 rounded-xl bg-amethyst px-4 text-sm font-semibold text-white">
                  Accept the deal of the century
                </button>
                <button type="button" onClick={() => setStep("pause")} className="lab-control">
                  No thanks
                </button>
              </div>
            </>
          ) : step === "pause" ? (
            <>
              <h2 className="text-lg font-semibold">How about a little pause instead?</h2>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {PAUSES.map((option) => (
                  <button key={option} type="button" onClick={() => keep(`Paused for ${option.toLowerCase()}. See you then (not really).`)} className="lab-control justify-center">
                    Pause for {option.toLowerCase()}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStep("type")} className="mt-3 text-xs text-muted-foreground underline">
                I want to cancel, not pause
              </button>
            </>
          ) : step === "type" ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (typed.trim().toUpperCase() === "CANCEL") finish();
              }}
            >
              <h2 className="text-lg font-semibold">Final step, honestly</h2>
              <label htmlFor="maze-confirm" className="mt-1 block text-sm text-muted-foreground">
                Type CANCEL to confirm. In any font you like.
              </label>
              <input
                id="maze-confirm"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                className="mt-3 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button type="submit" disabled={typed.trim().toUpperCase() !== "CANCEL"} className="lab-control mt-3">
                Confirm cancellation
              </button>
            </form>
          ) : (
            <>
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Check aria-hidden className="size-5 text-emerald-500" />
                Cancelled. We’ll miss you (fictionally).
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">You escaped {sub.name}. A real service should let you do this in one click.</p>
              <button type="button" onClick={() => setActive(null)} className="lab-control mt-4">
                Back to my subscriptions
              </button>
            </>
          )}
        </div>
        {step !== "done" ? (
          <div className="flex flex-wrap justify-between gap-2">
            <button type="button" onClick={() => keep("")} className="lab-control">
              Back to the list
            </button>
            <button type="button" onClick={finish} className="lab-control">
              <FastForward aria-hidden className="size-4" />
              Skip to the end
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-3">
      <p className="text-sm text-muted-foreground">Your totally made-up subscriptions. No money, account or real service is involved.</p>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {SUBSCRIPTIONS.map((item) => {
          const gone = cancelled.includes(item.id);
          return (
            <li key={item.id} className="flex items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-muted-foreground">{item.detail}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{gone ? "Cancelled" : item.price}</p>
              </div>
              {gone ? (
                <Check aria-label="Cancelled" className="size-5 shrink-0 text-emerald-500" />
              ) : (
                <button type="button" onClick={() => start(item.id)} className="lab-control shrink-0">
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <p aria-live="polite" className="min-h-5 text-sm">
        {note || (cancelled.length === SUBSCRIPTIONS.length ? "All cancelled. You are free. Free as unstored clouds." : "")}
      </p>
    </div>
  );
}

"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clover, Loader2, Store, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { activeBoosters, boostedOpenings, boosterLook, type Boost, type Booster } from "@/lib/boosters";
import { cn } from "@/lib/utils";
import { LuckBadge, tierStyle } from "./booster-parts";
import { LUCK_NO_GUARANTEE } from "./booster-shop";

const plural = (count: number, word: string) => `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;

function activateError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.code === "not_enough_boosters") return "You don’t have that many boosted openings of this tier. Nothing was activated.";
    if (error.code === "luck_cap") return "That would go over the luck limit. Nothing was activated.";
    if (error.status > 0 && error.status < 500) return error.message;
  }
  return "The activation wasn’t confirmed. Try again: the same activation is never applied twice.";
}

function TierRow({ booster, boost, onBoost }: { booster: Booster; boost: Boost; onBoost: (next: Boost) => void }) {
  const router = useRouter();
  const look = boosterLook(booster.id, booster.multiplier);
  const [text, setText] = useState("1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const request = useRef<{ id: string; charges: number } | null>(null);
  const value = /^\d+$/.test(text.trim()) ? Number(text) : NaN;
  const others = activeBoosters(boost).filter((entry) => entry.id !== booster.id).reduce((sum, entry) => sum + entry.multiplier, 0);
  const overCap = booster.active === 0 && others + booster.multiplier > boost.cap;
  const problem = !booster.quantity
    ? null
    : !Number.isInteger(value) || value < 1
      ? "Enter a whole number of openings."
      : value > booster.quantity
        ? `You have ${plural(booster.quantity, "opening")}.`
        : overCap
          ? `Total luck is capped at ${boost.cap}x.`
          : null;
  const fieldId = `activate-${booster.id}`;

  async function activate() {
    if (busy || problem || !booster.quantity) return;
    if (!request.current || request.current.charges !== value) request.current = { id: crypto.randomUUID(), charges: value };
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiFetch<{ boost: Boost }>("/api/lootboxes/boosters/activate", { method: "POST", json: { request: request.current.id, booster: booster.id, charges: value } });
      request.current = null;
      onBoost(result.boost);
      setText("1");
      setMessage({ error: false, text: `${plural(value, "boosted opening")} activated.` });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) request.current = null;
      setMessage({ error: true, text: activateError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li data-glow className="ui-panel grid content-start gap-3 p-4" style={{ ...tierStyle(booster), "--tone": "var(--luck)" } as CSSProperties}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="ui-icon">
          <Clover className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p id={`${fieldId}-name`} className="bx-ink font-semibold">
            {look.name}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {plural(booster.quantity, "boosted opening")} owned · {booster.active ? `active for ${plural(booster.active, "more opening")}` : "not active"}
          </p>
        </div>
      </div>
      {booster.quantity ? (
        <form
          className="grid gap-2"
          aria-labelledby={`${fieldId}-name`}
          onSubmit={(event) => {
            event.preventDefault();
            void activate();
          }}
        >
          <label htmlFor={fieldId} className="text-xs font-medium">
            Openings to activate (each booster bought adds {booster.charges})
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id={fieldId}
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={problem !== null}
              aria-describedby={`${fieldId}-hint`}
              className="w-20 text-center tabular-nums"
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => setText(String(booster.quantity))}>
              All ({booster.quantity})
            </Button>
            <Button type="submit" size="sm" disabled={busy || problem !== null} aria-busy={busy} className="ml-auto">
              {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Zap aria-hidden />}
              {problem ? "Activate" : `Activate ${value}`}
            </Button>
          </div>
          <p id={`${fieldId}-hint`} aria-live="polite" className={cn("text-xs", problem || message?.error ? "text-rose" : "text-muted-foreground")}>
            {problem ?? message?.text ?? `Boosts your next ${plural(Number.isInteger(value) ? value : 1, "case opening")}${booster.active ? ", added to the openings already active" : ""}.`}
          </p>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">{message?.text ?? "Nothing to activate."}</p>
      )}
    </li>
  );
}

/** Boosters in the Inventory: what's active, the total luck and how long it lasts, and activating charges. */
export function BoosterShelf({ boost: initial }: { boost: Boost | null }) {
  const [local, setLocal] = useState<Boost | null>(null);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setLocal(null);
  }
  const boost = local ?? initial;
  if (!boost) {
    return <p className="ui-empty px-4 py-6 text-center text-sm text-muted-foreground">Your boosters couldn’t be loaded. They’re safe; try again in a moment.</p>;
  }

  const active = activeBoosters(boost);
  const ownedAny = boost.boosters.some((booster) => booster.quantity > 0 || booster.active > 0);

  return (
    <section aria-label="Boosters" className="grid gap-3">
      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link href="/shop/boosters">
            <Store aria-hidden />
            Buy boosters
          </Link>
        </Button>
      </div>

      <div role="status" data-glow className="ui-panel grid gap-2 px-4 py-3 text-sm" style={{ "--tone": "#22c55e" } as CSSProperties}>
        {active.length ? (
          <>
            <p className="flex flex-wrap items-center gap-2">
              <LuckBadge luck={boost.luck} tiers={boost.boosters} />
              <span>
                on your next case opening · {plural(boostedOpenings(boost), "boosted opening")} left in total
              </span>
            </p>
            <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {active.map((booster) => (
                <li key={booster.id} className="bx-luck" style={tierStyle(booster)}>
                  {booster.multiplier}x · {plural(booster.active, "opening")}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Active tiers add up on the same openings and each case opened, of any case, uses one opening from every active tier. {LUCK_NO_GUARANTEE}
            </p>
          </>
        ) : (
            <p className="flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className="ui-dot opacity-50" />
              No booster is active. Case openings use the normal odds.
            </p>
        )}
      </div>

      {boost.boosters.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {boost.boosters.map((booster) => (
            <TierRow key={booster.id} booster={booster} boost={boost} onBoost={setLocal} />
          ))}
        </ul>
      ) : null}
      {!ownedAny ? (
        <p className="ui-empty px-4 py-6 text-center text-sm text-muted-foreground" style={{ "--tone": "#22c55e" } as CSSProperties}>
          You don’t have any boosters yet.{" "}
          <Link href="/shop/boosters" className="text-amethyst underline-offset-4 hover:underline">
            See Luck Boosters in the Shop
          </Link>
        </p>
      ) : null}
    </section>
  );
}

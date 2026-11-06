"use client";

import { useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Backpack, Clover, Coins, Info, Loader2, Minus, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError, apiFetch } from "@/lib/api-client";
import { MAX_BOOSTER_PURCHASE, activeBoosters, boostedOpenings, boosterLook, type Boost, type Booster } from "@/lib/boosters";
import { caseOdds, formatChance, lootCaseInfo, type LootState } from "@/lib/lootboxes";
import { RARITIES } from "@/lib/rarities";
import { cn } from "@/lib/utils";
import { LuckBadge, tierStyle } from "./booster-parts";
import { RarityTag } from "./parts";

const coinsText = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;
const openingsText = (value: number) => `${value.toLocaleString("en")} boosted case opening${value === 1 ? "" : "s"}`;
const boostersText = (value: number) => `${value.toLocaleString("en")} booster${value === 1 ? "" : "s"}`;

export const LUCK_RULE =
  "At luck L, each rarity’s chance weight is multiplied by L raised to that rarity’s luck power: Common stays the same and the rarer the rarity, the bigger the boost. Chances are then recalculated so they add up to 100%, and each rarity’s chance is split evenly between its items.";
export const LUCK_NO_GUARANTEE = "Luck improves rarity chances but never guarantees a specific reward or rarity.";

/** A small "i" button that opens details in a popover, so cards stay uncluttered. */
export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn("grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring", className)}
        >
          <Info aria-hidden className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 text-xs leading-5 text-muted-foreground">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function readQuantity(text: string): { value: number } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Enter how many boosters to buy." };
  if (!/^\d+$/.test(trimmed)) return { error: "Use a whole number, like 1 or 5." };
  const value = Number(trimmed);
  if (value < 1) return { error: "Buy at least one booster." };
  if (value > MAX_BOOSTER_PURCHASE) return { error: `Buy up to ${MAX_BOOSTER_PURCHASE} boosters at a time.` };
  return { value };
}

function purchaseError(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "insufficient_funds":
        return "You don’t have enough coins for that many boosters, so nothing was bought and no coins were taken.";
      case "price_changed":
        return "The booster price just changed, so nothing was bought and no coins were taken. Check the new price and try again.";
      case "item_unavailable":
        return "This booster isn’t on sale any more. No coins were taken.";
      default:
        return error.status >= 500 ? "The purchase didn’t go through, and no coins were taken. Try again in a moment." : error.message;
    }
  }
  return "The shop couldn’t be reached, so the purchase wasn’t confirmed. It’s safe to try again: this purchase is never charged twice.";
}

type Purchase = { booster: Booster; quantity: number; request: string; balance: number; stage: "confirm" | "done"; error?: string | null; balanceAfter?: number };

function BoosterCard({ booster, balance, busy, onBuy }: { booster: Booster; balance: number; busy: boolean; onBuy: (quantity: number) => void }) {
  const look = boosterLook(booster.id, booster.multiplier);
  const [text, setText] = useState("1");
  const parsed = readQuantity(text);
  const quantity = "value" in parsed ? parsed.value : null;
  const total = quantity === null ? null : quantity * booster.price;
  const short = total !== null && total > balance ? total - balance : 0;
  const fieldId = `booster-qty-${booster.id}`;
  const step = (delta: number) => setText(String(Math.min(MAX_BOOSTER_PURCHASE, Math.max(1, (quantity ?? 0) + delta))));

  return (
    <li data-glow className="ui-panel grid content-start gap-4 p-5" style={{ ...tierStyle(booster), "--tone": "var(--luck)" } as CSSProperties}>
      <div className="flex items-center gap-3">
        <span aria-hidden className="ui-icon">
          <Clover className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 id={`${fieldId}-name`} className="bx-ink text-lg font-semibold">
            {look.name}
          </h3>
          <p className="text-xs text-muted-foreground">{booster.charges} cases per booster</p>
        </div>
        <InfoTip label={`About ${look.name}`}>
          <p>
            One {look.name} booster boosts your next <strong className="text-foreground">{booster.charges} case openings</strong> of any case once activated in your Inventory.
          </p>
          <p className="mt-2">Each boosted opening uses {booster.multiplier}x luck. Active tiers add up (capped), so rarer rarities gain the most.</p>
          <p className="mt-2">
            You own {booster.quantity.toLocaleString("en")} unactivated and {booster.active.toLocaleString("en")} active boosted openings of this tier.
          </p>
          <p className="mt-2">{LUCK_NO_GUARANTEE}</p>
        </InfoTip>
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-xl font-semibold tabular-nums">
          <Coins aria-hidden className="coin-ink size-5" />
          <span className="coin-ink">{booster.price.toLocaleString("en")}</span>
        </p>
        {booster.quantity + booster.active ? (
          <span className="ui-pill tabular-nums" data-tone>
            {(booster.quantity + booster.active).toLocaleString("en")} openings owned
          </span>
        ) : null}
      </div>
      {booster.available ? (
        <form
          className="grid gap-2"
          aria-labelledby={`${fieldId}-name`}
          onSubmit={(event) => {
            event.preventDefault();
            if (quantity !== null && !short) onBuy(quantity);
          }}
        >
          <label htmlFor={fieldId} className="sr-only">
            Boosters
          </label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" aria-label="One fewer" disabled={quantity === null || quantity <= 1} onClick={() => step(-1)}>
              <Minus aria-hidden />
            </Button>
            <Input
              id={fieldId}
              inputMode="numeric"
              autoComplete="off"
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={"error" in parsed || short > 0}
              aria-describedby={`${fieldId}-hint`}
              className="w-20 text-center tabular-nums"
            />
            <Button type="button" variant="outline" size="icon" aria-label="One more" disabled={quantity !== null && quantity >= MAX_BOOSTER_PURCHASE} onClick={() => step(1)}>
              <Plus aria-hidden />
            </Button>
          </div>
          <p id={`${fieldId}-hint`} aria-live="polite" className={cn("text-xs", "error" in parsed || short ? "text-rose" : "text-muted-foreground")}>
            {"error" in parsed ? parsed.error : short ? `You need ${coinsText(short)} more.` : `Total ${coinsText(total ?? 0)} · ${openingsText((quantity ?? 0) * booster.charges)}.`}
          </p>
          <Button type="submit" disabled={busy || total === null || short > 0}>
            <Coins aria-hidden />
            {quantity === null ? "Buy" : `Buy ${boostersText(quantity)}`}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">No longer on sale. Owned boosters still work.</p>
      )}
    </li>
  );
}

/** Per-rarity chances of a case at a chosen luck, as bars (log scale) with the change against no booster. */
function OddsChart({ state, boost }: { state: LootState; boost: Boost }) {
  const lootCase = state.cases.find((entry) => entry.available) ?? state.cases[0];
  const levels = [1, ...boost.boosters.map((booster) => booster.multiplier), ...(boost.cap > 1 ? [boost.cap] : [])].filter((value, index, all) => all.indexOf(value) === index);
  const [picked, setPicked] = useState<number | null>(null);
  const luck = picked ?? (boost.luck > 1 ? boost.luck : levels.at(-1) ?? 1);
  if (!lootCase) return null;
  const base = caseOdds(lootCase.tiers);
  const odds = caseOdds(lootCase.tiers, luck);
  const label = (value: number) => (value === 1 ? "None" : value === boost.cap && !boost.boosters.some((booster) => booster.multiplier === value) ? `${value}x max` : `${value}x`);
  return (
    <div data-glow className="ui-panel grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Luck to preview" className="bx-seg">
          {[...new Set([...levels, ...(boost.luck > 1 ? [boost.luck] : [])])].sort((a, b) => a - b).map((value) => (
            <button key={value} type="button" aria-pressed={value === luck} onClick={() => setPicked(value)}>
              {label(value)}
            </button>
          ))}
        </div>
        <p className="ui-pill">{lootCaseInfo(lootCase.id).name}</p>
      </div>
      <ul aria-label={`Rarity chances per case at ${luck}x luck`} className="grid gap-1.5">
        {odds.map((tier, row) => {
          const gain = tier.chance / base[row].chance;
          return (
            <li key={tier.rarity} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[7.5rem_1fr_9rem]">
              <RarityTag rarity={tier.rarity} />
              <span aria-hidden className="bx-bar" data-rarity={tier.rarity} style={{ "--bar": RARITIES[tier.rarity].color } as CSSProperties}>
                <span style={{ width: `${Math.max(2, ((Math.log10(tier.chance) + 7) / 7) * 100)}%` }} />
              </span>
              <span className="text-right tabular-nums">
                {formatChance(tier.chance)}
                {luck > 1 ? (
                  <span className={cn("ml-1.5 text-xs", gain >= 1 ? "font-semibold text-foreground" : "text-muted-foreground")}>
                    {gain >= 1 ? `×${gain.toLocaleString("en", { maximumFractionDigits: gain < 10 ? 1 : 0 })}` : `−${Math.round((1 - gain) * 100)}%`}
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Luck Boosters in the Shop: the exact odds rule, each tier for Coins, and a confirmed purchase. */
export function BoosterShop({ state }: { state: LootState | null }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [local, setLocal] = useState<{ balance?: number; boost?: Boost }>({});
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setLocal({});
  }

  if (!state) {
    return (
      <div role="alert" data-glow className="ui-panel enter mx-auto max-w-md px-6 py-10 text-center" style={{ "--tone": "var(--rose)" } as CSSProperties}>
        <span aria-hidden className="ui-icon mx-auto">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Boosters couldn’t be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your coins and boosters are safe. Try again in a moment.</p>
        <Button className="mt-5" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
          {retrying ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  const balance = local.balance ?? state.balance;
  const boost = local.boost ?? state.boost;
  const active = activeBoosters(boost);

  async function buy() {
    if (!purchase || purchase.stage !== "confirm" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPurchase({ ...purchase, error: null });
    try {
      const result = await apiFetch<{ balance: number; boost: Boost }>("/api/lootboxes/boosters/purchase", {
        method: "POST",
        json: { request: purchase.request, booster: purchase.booster.id, quantity: purchase.quantity, price: purchase.booster.price },
      });
      setLocal({ balance: result.balance, boost: result.boost });
      setPurchase({ ...purchase, stage: "done", balanceAfter: result.balance });
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
      router.refresh();
    } catch (error) {
      setPurchase({ ...purchase, error: purchaseError(error) });
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const name = purchase ? boosterLook(purchase.booster.id, purchase.booster.multiplier).name : "";
  const total = purchase ? purchase.quantity * purchase.booster.price : 0;

  return (
    <div className="grid gap-8">
      <section aria-label="Coin balance" className="arcade-counter enter" style={{ "--enter-index": 1 } as CSSProperties}>
        <span aria-hidden className="arcade-counter-coin">
          <Coins className="size-5" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          <span className="coin-ink text-lg tabular-nums" aria-live="polite">
            {balance.toLocaleString("en")}
          </span>{" "}
          coin{balance === 1 ? "" : "s"}
        </span>
        <Link href="/inventory?tab=boosters" className="arcade-counter-cta">
          <Backpack aria-hidden className="size-4" />
          <span className="hidden sm:inline">Activate in Inventory</span>
          <span className="sm:hidden">Inventory</span>
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </section>

      {active.length ? (
        <p role="status" data-glow className="ui-panel enter flex flex-wrap items-center gap-2 px-4 py-3 text-sm" style={{ "--tone": "#22c55e" } as CSSProperties}>
          <LuckBadge luck={boost.luck} tiers={boost.boosters} />
          <span className="text-muted-foreground">active for your next {openingsText(boostedOpenings(boost))}.</span>
        </p>
      ) : null}

      <ul aria-label="Luck Boosters" className="enter grid gap-4 md:grid-cols-3" style={{ "--enter-index": 2 } as CSSProperties}>
        {boost.boosters.map((booster) => (
          <BoosterCard
            key={booster.id}
            booster={booster}
            balance={balance}
            busy={busy}
            onBuy={(quantity) => setPurchase({ booster, quantity, request: crypto.randomUUID(), balance, stage: "confirm" })}
          />
        ))}
      </ul>

      <section aria-labelledby="luck-odds" className="enter grid gap-3" style={{ "--enter-index": 3 } as CSSProperties}>
        <div className="flex items-center justify-between gap-2">
          <h2 id="luck-odds" className="flex items-center gap-2.5 text-base font-semibold">
            <span aria-hidden className="ui-icon ui-icon-sm" style={{ "--tone": "#22c55e" } as CSSProperties}>
              <Clover className="size-4" />
            </span>
            Odds per case
          </h2>
          <InfoTip label="How luck works">
            <ul className="grid list-disc gap-1.5 pl-4">
              <li>One booster boosts {boost.boosters[0]?.charges ?? 10} case openings of any case. Activate boosters in your Inventory; they apply to your next openings and stay active until used.</li>
              <li>{LUCK_RULE}</li>
              <li>Active tiers add up on the same openings: 2x and 5x together give 7x luck. A tier with fewer openings left stops while the others continue. Total luck is capped at {boost.cap}x.</li>
              <li>Bars use a log scale so the rarest tiers stay visible. The × figure compares with opening without a booster.</li>
              <li>
                <strong className="font-medium text-foreground">{LUCK_NO_GUARANTEE}</strong> Duplicate refunds work exactly as without a booster. Boosters are bought with Coins only and can’t be exchanged for money or refunded.
              </li>
            </ul>
          </InfoTip>
        </div>
        <OddsChart state={state} boost={boost} />
      </section>

      <AlertDialog open={purchase !== null} onOpenChange={(open) => !open && !busy && setPurchase(null)}>
        <AlertDialogContent style={purchase ? tierStyle(purchase.booster) : undefined}>
          {purchase?.stage === "done" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {purchase.quantity} × {name} added
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {coinsText(total)} spent. Your balance is now {(purchase.balanceAfter ?? balance).toLocaleString("en")}. Activate them in your Inventory to boost your next {openingsText(purchase.quantity * purchase.booster.charges)}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep shopping</AlertDialogCancel>
                <Button asChild>
                  <Link href="/inventory?tab=boosters">
                    <Backpack aria-hidden />
                    Activate in Inventory
                  </Link>
                </Button>
              </AlertDialogFooter>
            </>
          ) : purchase ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Buy {purchase.quantity} × {name}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Coins are taken once and the boosters go to your Inventory, inactive until you activate them. {LUCK_NO_GUARANTEE}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <dl className="ui-panel grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 px-3 py-2.5 text-sm">
                <dt className="text-muted-foreground">Quantity</dt>
                <dd className="text-right tabular-nums">
                  {purchase.quantity} × {coinsText(purchase.booster.price)}
                </dd>
                <dt className="text-muted-foreground">Total cost</dt>
                <dd className="text-right font-medium tabular-nums">{coinsText(total)}</dd>
                <dt className="text-muted-foreground">Balance before</dt>
                <dd className="text-right tabular-nums">{purchase.balance.toLocaleString("en")}</dd>
                <dt className="text-muted-foreground">Balance after</dt>
                <dd className="text-right font-semibold tabular-nums">{Math.max(0, purchase.balance - total).toLocaleString("en")}</dd>
                <dt className="border-t border-border pt-1.5 font-medium text-foreground">Grants</dt>
                <dd className="bx-ink border-t border-border pt-1.5 text-right font-semibold">{openingsText(purchase.quantity * purchase.booster.charges)}</dd>
              </dl>
              {purchase.error ? (
                <p role="alert" className="text-sm text-rose">
                  {purchase.error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <Button onClick={() => void buy()} disabled={busy || purchase.balance < total} aria-busy={busy}>
                  {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Coins aria-hidden />}
                  {busy ? "Buying…" : `Buy for ${coinsText(total)}`}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

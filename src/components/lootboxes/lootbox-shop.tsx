"use client";

import { useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Backpack, Coins, Info, Loader2, Minus, Package, Plus, RotateCcw, TriangleAlert } from "lucide-react";
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
import { ApiError, apiFetch } from "@/lib/api-client";
import { MAX_CASE_PURCHASE, lootCaseInfo, type LootCase, type LootState, type RefundRates } from "@/lib/lootboxes";
import { cn } from "@/lib/utils";
import { CaseArt, DUPLICATE_NOTE, OddsList, RefundRateList, caseStyle } from "./parts";
import { LuckBadge } from "./booster-parts";
import { LUCK_NO_GUARANTEE } from "./booster-shop";
import { boostedOpenings, type Boost } from "@/lib/boosters";

const coinsText = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;
const casesText = (value: number, name: string) => `${value.toLocaleString("en")} ${name}${value === 1 ? "" : "s"}`;
const rateRange = (rates: RefundRates) => {
  const values = Object.values(rates);
  return values.length ? `${Math.min(...values)}–${Math.max(...values)}%` : "a share";
};

/** A whole number of cases from the field, or the reason it isn't one. */
function readQuantity(text: string): { value: number } | { error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "Enter how many cases to buy." };
  if (!/^\d+$/.test(trimmed)) return { error: "Use a whole number, like 1 or 5." };
  const value = Number(trimmed);
  if (value < 1) return { error: "Buy at least one case." };
  if (value > MAX_CASE_PURCHASE) return { error: `Buy up to ${MAX_CASE_PURCHASE.toLocaleString("en")} cases at a time.` };
  return { value };
}

function purchaseError(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "insufficient_funds":
        return "You don’t have enough coins for that many cases, so nothing was bought and no coins were taken.";
      case "price_changed":
        return "The case price just changed, so nothing was bought and no coins were taken. Check the new price and try again.";
      case "item_unavailable":
        return "This case isn’t on sale any more. No coins were taken.";
      default:
        return error.status >= 500 ? "The purchase didn’t go through, and no coins were taken. Try again in a moment." : error.message;
    }
  }
  return "The shop couldn’t be reached, so the purchase wasn’t confirmed. It’s safe to try again: this purchase is never charged twice.";
}

type Purchase = { caseId: string; quantity: number; price: number; request: string; stage: "confirm" | "done"; error?: string | null; balanceAfter?: number; owned?: number };

function CasePanel({
  lootCase,
  balance,
  owned,
  refundRates,
  boost,
  onBuy,
  busy,
}: {
  lootCase: LootCase;
  balance: number;
  owned: number;
  refundRates: RefundRates;
  boost: Boost;
  onBuy: (quantity: number) => void;
  busy: boolean;
}) {
  const info = lootCaseInfo(lootCase.id);
  const [text, setText] = useState("1");
  const parsed = readQuantity(text);
  const quantity = "value" in parsed ? parsed.value : null;
  const product = quantity === null ? null : quantity * lootCase.price;
  const total = product !== null && Number.isSafeInteger(product) ? product : null;
  const short = total !== null && total > balance ? total - balance : 0;
  const step = (delta: number) => setText(String(Math.min(MAX_CASE_PURCHASE, Math.max(1, (quantity ?? 0) + delta))));
  const fieldId = `case-qty-${lootCase.id}`;
  const hintId = `${fieldId}-hint`;

  return (
    <section aria-labelledby={`case-${lootCase.id}`} className="enter grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,25rem)]" style={{ ...caseStyle(lootCase.id), "--enter-index": 2 } as CSSProperties}>
      <div className="lb-stage p-5 sm:p-6">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <CaseArt id={lootCase.id} size="10rem" float />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 id={`case-${lootCase.id}`} className="text-2xl font-semibold tracking-tight">
              {info.name}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-pretty text-muted-foreground">{info.tagline}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] px-3 py-1 text-sm font-semibold tabular-nums">
                <Coins aria-hidden className="coin-ink size-4" />
                <span className="coin-ink">{lootCase.price.toLocaleString("en")}</span>
                <span className="font-normal text-muted-foreground">per case</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                <Backpack aria-hidden className="size-3.5" />
                {owned ? `${owned} in your Inventory` : "None owned"}
              </span>
            </div>
          </div>
        </div>

        {lootCase.available ? (
          <form
            className="mt-6 grid gap-3 rounded-xl border border-border bg-background/40 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (total !== null && quantity !== null && !short) onBuy(quantity);
            }}
          >
            <label htmlFor={fieldId} className="text-sm font-medium">
              How many cases?
            </label>
            <div className="flex flex-wrap items-center gap-2">
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
                aria-describedby={hintId}
                className="w-20 text-center tabular-nums"
              />
              <Button type="button" variant="outline" size="icon" aria-label="One more" disabled={quantity !== null && quantity >= MAX_CASE_PURCHASE} onClick={() => step(1)}>
                <Plus aria-hidden />
              </Button>
              {[5, 10, 25, 100].map((preset) => (
                <Button key={preset} type="button" variant="ghost" size="sm" aria-pressed={quantity === preset} onClick={() => setText(String(preset))}>
                  ×{preset}
                </Button>
              ))}
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Total</dt>
              <dd className="text-right font-semibold tabular-nums">{total === null ? "—" : coinsText(total)}</dd>
              <dt className="text-muted-foreground">Your balance</dt>
              <dd className="text-right tabular-nums">{coinsText(balance)}</dd>
            </dl>
            <p id={hintId} aria-live="polite" className={cn("text-xs", "error" in parsed || short ? "text-rose" : "text-muted-foreground")}>
              {"error" in parsed
                ? parsed.error
                : short
                  ? `You need ${coinsText(short)} more for ${casesText(quantity ?? 0, "case")}. Play Arcade games to earn coins.`
                  : `Cases go to your Inventory, where you open them. Up to ${MAX_CASE_PURCHASE.toLocaleString("en")} per purchase.`}
            </p>
            <Button type="submit" disabled={busy || total === null || short > 0} className="w-full sm:w-auto sm:justify-self-start">
              <Coins aria-hidden />
              {quantity === null ? "Buy cases" : `Buy ${casesText(quantity, "case")}`}
            </Button>
          </form>
        ) : (
          <p className="mt-6 rounded-xl border border-border p-4 text-sm text-muted-foreground">This case is no longer on sale. Cases you own can still be opened.</p>
        )}
      </div>

      <aside aria-labelledby={`odds-${lootCase.id}`} className="grid gap-3">
        <div>
          <h3 id={`odds-${lootCase.id}`} className="text-sm font-semibold">
            Rewards and exact odds
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Each case gives one cosmetic. Expand a rarity to see every item and its own chance.</p>
        </div>
        {boost.luck > 1 ? (
          <div className="grid gap-1.5 rounded-lg border border-border p-3 text-xs leading-5 text-muted-foreground">
            <span className="flex flex-wrap items-center gap-2">
              <LuckBadge luck={boost.luck} tiers={boost.boosters} />
              <span>
                Your next opening uses boosted odds; base chances are struck through. {boostedOpenings(boost).toLocaleString("en")} boosted opening
                {boostedOpenings(boost) === 1 ? "" : "s"} left.
              </span>
            </span>
            <span>{LUCK_NO_GUARANTEE}</span>
          </div>
        ) : null}
        <OddsList tiers={lootCase.tiers} luck={boost.luck} />
        <div className="grid gap-2 rounded-lg border border-border p-3">
          <h3 className="text-sm font-semibold">Duplicate refunds</h3>
          <p className="text-xs leading-5 text-muted-foreground">
            Share of the price you paid, by rarity, with the Coins it refunds at {coinsText(lootCase.price)}. Refunds always use the price you actually paid.
          </p>
          <RefundRateList rates={refundRates} price={lootCase.price} />
        </div>
        <p className="flex gap-2 rounded-lg border border-border bg-foreground/[0.02] p-3 text-xs leading-5 text-muted-foreground">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {DUPLICATE_NOTE} Secret items stay hidden until you own them. Cases are bought with Coins only and can’t be exchanged for money.
          </span>
        </p>
      </aside>
    </section>
  );
}

/** The Lootboxes shop: balance, every case on sale with its drop table, and buying by quantity. */
export function LootboxShop({ state }: { state: LootState | null }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [local, setLocal] = useState<{ balance?: number; owned: Record<string, number> }>({ owned: {} });
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    setLocal({ owned: {} });
  }

  if (!state) {
    return (
      <div role="alert" className="enter mx-auto max-w-md rounded-2xl border border-rose/40 bg-card px-6 py-10 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose/40 bg-rose/10 text-rose">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">The Lootboxes shop couldn’t be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your coins and cases are safe. Try again in a moment.</p>
        <Button className="mt-5" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
          {retrying ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  const balance = local.balance ?? state.balance;
  const ownedOf = (lootCase: LootCase) => local.owned[lootCase.id] ?? lootCase.quantity;
  const pendingCases = state.pending.reduce((sum, opening) => sum + opening.quantity, 0);

  async function buy() {
    if (!purchase || purchase.stage !== "confirm" || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setPurchase({ ...purchase, error: null });
    try {
      const result = await apiFetch<{ status: "purchased" | "repeat"; bought: number; owned: number; balance: number }>("/api/lootboxes/purchase", {
        method: "POST",
        json: { request: purchase.request, case: purchase.caseId, quantity: purchase.quantity, price: purchase.price },
      });
      setLocal((current) => ({ balance: result.balance, owned: { ...current.owned, [purchase.caseId]: result.owned } }));
      setPurchase({ ...purchase, stage: "done", balanceAfter: result.balance, owned: result.owned });
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

  const dialogName = purchase ? lootCaseInfo(purchase.caseId).name : "";
  const dialogTotal = purchase ? purchase.quantity * purchase.price : 0;

  return (
    <div className="grid gap-8">
      <section aria-label="Coin balance" className="arcade-counter enter" style={{ "--enter-index": 1 } as CSSProperties}>
        <span aria-hidden className="arcade-counter-coin">
          <Coins className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">
            <span className="coin-ink text-lg tabular-nums" aria-live="polite">
              {balance.toLocaleString("en")}
            </span>{" "}
            coin{balance === 1 ? "" : "s"}
          </span>
        </span>
        <Link href="/inventory?tab=cases" className="arcade-counter-cta">
          <Backpack aria-hidden className="size-4" />
          <span className="hidden sm:inline">Open cases in Inventory</span>
          <span className="sm:hidden">Inventory</span>
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </section>

      {state.pending.length ? (
        <div role="status" className="enter flex flex-wrap items-center gap-3 rounded-xl border border-amethyst/40 bg-amethyst/[0.08] px-4 py-3 text-sm">
          <Package aria-hidden className="size-4 text-amethyst" />
          <span className="min-w-0 flex-1">
            Rewards from {casesText(pendingCases, "case")} are saved and waiting to be revealed and claimed.
          </span>
          <Button asChild size="sm">
            <Link href="/inventory?tab=cases">Reveal rewards</Link>
          </Button>
        </div>
      ) : null}

      {state.cases.length ? (
        state.cases.map((lootCase) => (
          <CasePanel
            key={lootCase.id}
            lootCase={lootCase}
            balance={balance}
            owned={ownedOf(lootCase)}
            refundRates={state.refundRates}
            boost={state.boost}
            busy={busy}
            onBuy={(quantity) => setPurchase({ caseId: lootCase.id, quantity, price: lootCase.price, request: crypto.randomUUID(), stage: "confirm" })}
          />
        ))
      ) : (
        <div className="enter rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <Package aria-hidden className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">No cases on sale right now</h2>
          <p className="mt-1 text-sm text-muted-foreground">Check back later.</p>
        </div>
      )}

      <AlertDialog open={purchase !== null} onOpenChange={(open) => !open && !busy && setPurchase(null)}>
        <AlertDialogContent>
          {purchase?.stage === "done" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{casesText(purchase.quantity, dialogName)} added</AlertDialogTitle>
                <AlertDialogDescription>
                  {coinsText(dialogTotal)} spent. Your balance is now {(purchase.balanceAfter ?? balance).toLocaleString("en")}, and you have {purchase.owned ?? 0} to open.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep shopping</AlertDialogCancel>
                <Button asChild>
                  <Link href="/inventory?tab=cases">
                    <Backpack aria-hidden />
                    Open in Inventory
                  </Link>
                </Button>
              </AlertDialogFooter>
            </>
          ) : purchase ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Buy {casesText(purchase.quantity, dialogName)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Coins are taken once and the cases go straight to your Inventory. Duplicate rewards refund {rateRange(state.refundRates)} of this price, by rarity.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-sm">
                <dt className="text-muted-foreground">
                  {purchase.quantity} × {coinsText(purchase.price)}
                </dt>
                <dd className="text-right font-medium tabular-nums">{coinsText(dialogTotal)}</dd>
                <dt className="text-muted-foreground">Your balance</dt>
                <dd className="text-right tabular-nums">{balance.toLocaleString("en")}</dd>
                <dt className="border-t border-border pt-1.5 font-medium text-foreground">Balance after</dt>
                <dd className="border-t border-border pt-1.5 text-right font-semibold tabular-nums">{Math.max(0, balance - dialogTotal).toLocaleString("en")}</dd>
              </dl>
              {purchase.error ? (
                <p role="alert" className="text-sm text-rose">
                  {purchase.error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                <Button onClick={() => void buy()} disabled={busy || balance < dialogTotal} aria-busy={busy}>
                  {busy ? <Loader2 aria-hidden className="animate-spin" /> : <Coins aria-hidden />}
                  {busy ? "Buying…" : `Buy for ${coinsText(dialogTotal)}`}
                </Button>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

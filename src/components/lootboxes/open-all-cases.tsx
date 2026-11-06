"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Layers, Loader2, RotateCcw, Square, TriangleAlert } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError, apiFetch } from "@/lib/api-client";
import { BULK_STEP, lootCaseInfo, type LootBulkStep } from "@/lib/lootboxes";

type Totals = { opened: number; newItems: number; duplicates: number; refund: number };
type Phase = "pick" | "amounts" | "running" | "error" | "done";
type Step = { id: string; case: string; quantity: number };

const EMPTY: Totals = { opened: 0, newItems: 0, duplicates: 0, refund: 0 };
const n = (value: number) => value.toLocaleString("en");

/** Administrator only: opens chosen amounts of chosen cases in server-side batches, without the reveal animation. */
export function OpenAllCases({ cases, pending }: { cases: { id: string; quantity: number }[]; pending: number }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [planned, setPlanned] = useState(0);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  // Cases still to open, in order; the head shrinks as steps succeed.
  const queue = useRef<{ case: string; left: number }[]>([]);
  const step = useRef<Step | null>(null);
  const stopping = useRef(false);
  const [stopRequested, setStopRequested] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);

  const total = cases.reduce((sum, lootCase) => sum + lootCase.quantity, 0);
  const chosen = cases.filter((lootCase) => selected.includes(lootCase.id));
  const plan = chosen.map((lootCase) => {
    const raw = amounts[lootCase.id] ?? String(lootCase.quantity);
    const value = /^\d+$/.test(raw) ? Number(raw) : NaN;
    return { case: lootCase.id, owned: lootCase.quantity, raw, value, valid: Number.isSafeInteger(value) && value >= 1 && value <= lootCase.quantity };
  });
  const planValid = plan.length > 0 && plan.every((entry) => entry.valid);
  const planTotal = planValid ? plan.reduce((sum, entry) => sum + entry.value, 0) : 0;
  const left = planned - totals.opened;

  function toggle(id: string, on: boolean) {
    setSelected((current) => (on ? [...current, id] : current.filter((value) => value !== id)));
  }

  async function run() {
    setPhase("running");
    setError(null);
    let sum = totals;
    for (;;) {
      // A failed step keeps its id and size, so retrying returns the saved result instead of opening again.
      if (!step.current) {
        const head = queue.current[0];
        if (!head) break;
        step.current = { id: crypto.randomUUID(), case: head.case, quantity: Math.min(BULK_STEP, head.left) };
      }
      const current = step.current;
      let result: LootBulkStep;
      try {
        result = await apiFetch<LootBulkStep>("/api/lootboxes/open-all", { method: "POST", json: { step: current.id, case: current.case, quantity: current.quantity } });
      } catch (caught) {
        setError(
          caught instanceof ApiError && caught.status >= 400 && caught.status < 500
            ? caught.message
            : "The connection dropped during a batch. Try again: that batch is either saved or wasn’t opened, and it’s never opened or refunded twice.",
        );
        setPhase("error");
        return;
      }
      step.current = null;
      const [first, ...rest] = queue.current;
      queue.current = first && first.left > current.quantity ? [{ case: first.case, left: first.left - current.quantity }, ...rest] : rest;
      sum = { opened: sum.opened + result.opened, newItems: sum.newItems + result.newItems, duplicates: sum.duplicates + result.duplicates, refund: sum.refund + result.refund };
      setTotals(sum);
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
      if (!queue.current.length || stopping.current) break;
    }
    setPhase("done");
    router.refresh();
  }

  function begin() {
    if (!planValid) return;
    stopping.current = false;
    setStopRequested(false);
    setUnconfirmed(false);
    step.current = null;
    queue.current = plan.map((entry) => ({ case: entry.case, left: entry.value }));
    setTotals(EMPTY);
    setPlanned(planTotal);
    void run();
  }

  function finish() {
    setUnconfirmed(step.current !== null);
    step.current = null;
    router.refresh();
    setPhase("done");
  }

  function show() {
    setSelected([]);
    setAmounts({});
    setPhase("pick");
  }

  const percent = planned ? Math.min(100, Math.round((totals.opened / planned) * 100)) : 0;

  return (
    <>
      <Button variant="outline" size="sm" disabled={total < 1} onClick={show}>
        <Layers aria-hidden />
        Open cases in bulk
      </Button>
      <AlertDialog open={phase !== null} onOpenChange={(open) => !open && phase !== "running" && setPhase(null)}>
        <AlertDialogContent>
          {phase === "pick" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Which cases?</AlertDialogTitle>
                <AlertDialogDescription>Choose the cases to open. You’ll pick how many of each next.</AlertDialogDescription>
              </AlertDialogHeader>
              <fieldset className="grid gap-1.5">
                <legend className="sr-only">Cases to open</legend>
                {cases.map((lootCase) => (
                  <label key={lootCase.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm has-data-checked:border-amethyst/60">
                    <Checkbox checked={selected.includes(lootCase.id)} onCheckedChange={(value) => toggle(lootCase.id, value === true)} />
                    <span className="flex-1 font-medium">{lootCaseInfo(lootCase.id).name}</span>
                    <span className="text-muted-foreground tabular-nums">{n(lootCase.quantity)} owned</span>
                  </label>
                ))}
              </fieldset>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button disabled={!selected.length} onClick={() => setPhase("amounts")}>
                  Next
                  <ArrowRight aria-hidden />
                </Button>
              </AlertDialogFooter>
            </>
          ) : phase === "amounts" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>How many of each?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cases are opened and claimed in batches on the server, without the reveal animation. Exact odds, active boosters and duplicate refunds work as usual. This
                  uses only your own cases and can’t be undone.
                  {pending ? ` Your ${n(pending)} saved opening${pending === 1 ? "" : "s"} stay${pending === 1 ? "s" : ""} waiting to be revealed.` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid gap-2">
                {plan.map((entry) => {
                  const inputId = `bulk-amount-${entry.case}`;
                  return (
                    <div key={entry.case} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                      <label htmlFor={inputId} className="flex-1 font-medium">
                        {lootCaseInfo(entry.case).name}
                        <span className="block text-xs font-normal text-muted-foreground">1 to {n(entry.owned)}</span>
                      </label>
                      <Input
                        id={inputId}
                        inputMode="numeric"
                        aria-invalid={!entry.valid}
                        value={entry.raw}
                        onChange={(event) => setAmounts((current) => ({ ...current, [entry.case]: event.target.value.trim() }))}
                        className="w-24 text-right tabular-nums"
                      />
                      <Button variant="ghost" size="sm" onClick={() => setAmounts((current) => ({ ...current, [entry.case]: String(entry.owned) }))}>
                        All
                      </Button>
                    </div>
                  );
                })}
              </div>
              {!planValid ? (
                <p role="alert" className="text-sm text-rose">
                  Enter a whole number between 1 and the amount you own for each case.
                </p>
              ) : null}
              <AlertDialogFooter>
                <Button variant="outline" onClick={() => setPhase("pick")}>
                  <ArrowLeft aria-hidden />
                  Back
                </Button>
                <Button disabled={!planValid} onClick={begin}>
                  <Layers aria-hidden />
                  {planValid ? `Open ${n(planTotal)} case${planTotal === 1 ? "" : "s"}` : "Open cases"}
                </Button>
              </AlertDialogFooter>
            </>
          ) : phase ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{phase === "done" ? "Cases opened" : phase === "error" ? "Opening paused" : "Opening cases…"}</AlertDialogTitle>
                <AlertDialogDescription aria-live="polite">
                  {n(totals.opened)} of {n(planned)} opened
                  {phase !== "done" && left > 0 ? ` · ${n(left)} left` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div role="progressbar" aria-label="Cases opened" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-amethyst transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
              </div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-sm">
                <dt className="text-muted-foreground">Cases opened</dt>
                <dd className="text-right font-medium tabular-nums">{n(totals.opened)}</dd>
                <dt className="text-muted-foreground">New rewards</dt>
                <dd className="text-right tabular-nums">{n(totals.newItems)}</dd>
                <dt className="text-muted-foreground">Duplicates</dt>
                <dd className="text-right tabular-nums">{n(totals.duplicates)}</dd>
                <dt className="text-muted-foreground">Coins refunded</dt>
                <dd className="coin-ink text-right font-semibold tabular-nums">{n(totals.refund)}</dd>
              </dl>
              {phase === "error" && error ? (
                <p role="alert" className="flex gap-2 text-sm text-rose">
                  <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              ) : null}
              {phase === "done" && left > 0 ? <p className="text-sm text-muted-foreground">{n(left)} selected cases stayed in your Inventory.</p> : null}
              {phase === "done" && unconfirmed ? (
                <p className="text-sm text-muted-foreground">The last batch wasn’t confirmed. If it went through, its rewards and refunds are already in your account; the counts above don’t include it.</p>
              ) : null}
              <AlertDialogFooter>
                {phase === "running" ? (
                  <Button
                    variant="outline"
                    disabled={stopRequested}
                    onClick={() => {
                      stopping.current = true;
                      setStopRequested(true);
                    }}
                  >
                    {stopRequested ? <Loader2 aria-hidden className="animate-spin" /> : <Square aria-hidden />}
                    {stopRequested ? "Stopping after this batch…" : "Stop after this batch"}
                  </Button>
                ) : null}
                {phase === "error" ? (
                  <>
                    <Button variant="outline" onClick={finish}>
                      Stop here
                    </Button>
                    <Button onClick={() => void run()}>
                      <RotateCcw aria-hidden />
                      Try again
                    </Button>
                  </>
                ) : null}
                {phase === "done" ? <AlertDialogCancel>Done</AlertDialogCancel> : null}
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Layers, Loader2, RotateCcw, Square, TriangleAlert } from "lucide-react";
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
import { useSettings } from "@/components/layout/settings-context";
import { useMotionLevel } from "@/components/showcase/motion";
import { ApiError, apiFetch } from "@/lib/api-client";
import { BULK_STEP, lootCaseInfo, type LootBulkStep } from "@/lib/lootboxes";
import { RARITIES, RARITY_IDS, isCutsceneRarity, isRarity, rarityRank, type CutsceneRarity, type RarityId } from "@/lib/rarities";
import { cn } from "@/lib/utils";
import { CaseArt, RarityTag, caseStyle, rewardItem } from "./parts";
import { PullCutscene } from "./pull-cutscene";

type Pull = LootBulkStep["pulls"][number];
type Totals = { opened: number; newItems: number; duplicates: number; refund: number; rarities: Partial<Record<RarityId, number>>; pulls: Pull[] };
type Phase = "pick" | "amounts" | "running" | "error" | "done";
type Step = { id: string; case: string; quantity: number };

const EMPTY: Totals = { opened: 0, newItems: 0, duplicates: 0, refund: 0, rarities: {}, pulls: [] };
const SHOWN_PULLS = 40;
const QUICK_AMOUNTS = [10, 100] as const;
const n = (value: number) => value.toLocaleString("en");
const pullName = (pull: Pull) => rewardItem(pull)?.name ?? pull.item;
const byRank = (a: Pull, b: Pull) => rarityRank(b.rarity) - rarityRank(a.rarity);

/** Administrator only: opens chosen amounts of chosen cases in server-side batches; each batch's best rare pull still plays its scene. */
export function OpenAllCases({ cases, pending }: { cases: { id: string; quantity: number }[]; pending: number }) {
  const router = useRouter();
  const motion = useMotionLevel();
  const { pullCutscenes } = useSettings();
  const [phase, setPhase] = useState<Phase | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [planned, setPlanned] = useState(0);
  const [totals, setTotals] = useState<Totals>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [currentCase, setCurrentCase] = useState<string | null>(null);
  const [cutscene, setCutscene] = useState<{ rarity: CutsceneRarity; name: string } | null>(null);
  const [scenes, setScenes] = useState(true);
  // Cases still to open, in order; the head shrinks as steps succeed.
  const queue = useRef<{ case: string; left: number }[]>([]);
  const step = useRef<Step | null>(null);
  const stopping = useRef(false);
  const playScenes = useRef(true);
  const sceneDone = useRef<(() => void) | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);

  const scenesAvailable = motion !== "off" && pullCutscenes.length > 0;
  const total = cases.reduce((sum, lootCase) => sum + lootCase.quantity, 0);
  const allSelected = cases.length > 0 && selected.length === cases.length;
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

  function setPlayScenes(on: boolean) {
    playScenes.current = on;
    setScenes(on);
  }

  function endScene() {
    setCutscene(null);
    const resolve = sceneDone.current;
    sceneDone.current = null;
    resolve?.();
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
      setCurrentCase(current.case);
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
      const pulls = result.pulls ?? [];
      const rarities = { ...sum.rarities };
      for (const [rarity, count] of Object.entries(result.rarities ?? {})) if (isRarity(rarity)) rarities[rarity] = (rarities[rarity] ?? 0) + count;
      sum = {
        opened: sum.opened + result.opened,
        newItems: sum.newItems + result.newItems,
        duplicates: sum.duplicates + result.duplicates,
        refund: sum.refund + result.refund,
        rarities,
        pulls: [...sum.pulls, ...pulls].sort(byRank),
      };
      setTotals(sum);
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
      // Like a normal opening, the batch's best enabled pull gets its scene; the next batch waits for it.
      const best = scenesAvailable && playScenes.current ? pulls.filter((pull) => pullCutscenes.some((rarity) => rarity === pull.rarity)).sort(byRank)[0] : undefined;
      if (best && isCutsceneRarity(best.rarity)) {
        const scene = { rarity: best.rarity, name: pullName(best) };
        await new Promise<void>((resolve) => {
          sceneDone.current = resolve;
          setCutscene(scene);
        });
      }
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
    setCurrentCase(null);
    setPhase("pick");
  }

  const percent = planned ? Math.min(100, Math.round((totals.opened / planned) * 100)) : 0;
  const shownCase = currentCase ?? plan[0]?.case ?? "release";

  const sceneToggle = scenesAvailable ? (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox checked={scenes} onCheckedChange={(value) => setPlayScenes(value === true)} />
      Play the scene for each batch’s best rare pull
    </label>
  ) : null;

  return (
    <>
      <Button variant="outline" size="sm" disabled={total < 1} onClick={show}>
        <Layers aria-hidden />
        Open cases in bulk
      </Button>
      <AlertDialog open={phase !== null} onOpenChange={(open) => !open && phase !== "running" && setPhase(null)}>
        <AlertDialogContent className="data-[size=default]:sm:max-w-xl" onEscapeKeyDown={(event) => cutscene && event.preventDefault()}>
          {phase === "pick" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Which cases?</AlertDialogTitle>
                <AlertDialogDescription>Choose the cases to open. You’ll pick how many of each next.</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {n(selected.length)} of {n(cases.length)} selected
                </span>
                <Button variant="ghost" size="sm" onClick={() => setSelected(allSelected ? [] : cases.map((lootCase) => lootCase.id))}>
                  {allSelected ? "Clear" : "Select all"}
                </Button>
              </div>
              <div role="group" aria-label="Cases to open" className="-mt-2 grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto p-0.5 sm:grid-cols-3">
                {cases.map((lootCase) => {
                  const on = selected.includes(lootCase.id);
                  return (
                    <button
                      key={lootCase.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(lootCase.id, !on)}
                      style={caseStyle(lootCase.id)}
                      className={cn(
                        "relative flex flex-col items-center gap-1 rounded-lg border border-border p-2 pb-2.5 text-center text-sm transition-colors outline-none hover:bg-foreground/[0.03] focus-visible:ring-2 focus-visible:ring-ring",
                        on && "border-(--case) bg-[color-mix(in_oklab,var(--case)_12%,transparent)]",
                      )}
                    >
                      <span aria-hidden className={cn("absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-sm border", on ? "border-transparent bg-(--case) text-white" : "border-border")}>
                        {on ? <Check className="size-3" /> : null}
                      </span>
                      <CaseArt id={lootCase.id} size="4rem" />
                      <span className="leading-tight font-medium">{lootCaseInfo(lootCase.id).name}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{n(lootCase.quantity)} owned</span>
                    </button>
                  );
                })}
              </div>
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
                  Cases are opened and claimed in batches of up to {n(BULK_STEP)} on the server. Exact odds, active boosters and duplicate refunds work as usual. This uses only
                  your own cases and can’t be undone.
                  {pending ? ` Your ${n(pending)} saved opening${pending === 1 ? "" : "s"} stay${pending === 1 ? "s" : ""} waiting to be revealed.` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="grid max-h-[45vh] gap-2 overflow-y-auto p-0.5">
                {plan.map((entry) => {
                  const inputId = `bulk-amount-${entry.case}`;
                  const set = (value: number) => setAmounts((current) => ({ ...current, [entry.case]: String(value) }));
                  return (
                    <div key={entry.case} style={caseStyle(entry.case)} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <CaseArt id={entry.case} size="2.5rem" />
                      <label htmlFor={inputId} className="min-w-0 flex-1 font-medium">
                        {lootCaseInfo(entry.case).name}
                        <span className="block text-xs font-normal text-muted-foreground">1 to {n(entry.owned)}</span>
                      </label>
                      <div className="flex items-center gap-1">
                        {QUICK_AMOUNTS.filter((amount) => amount < entry.owned).map((amount) => (
                          <Button key={amount} variant="ghost" size="sm" className="tabular-nums" onClick={() => set(amount)}>
                            {n(amount)}
                          </Button>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => set(entry.owned)}>
                          All
                        </Button>
                        <Input
                          id={inputId}
                          inputMode="numeric"
                          aria-invalid={!entry.valid}
                          value={entry.raw}
                          onChange={(event) => setAmounts((current) => ({ ...current, [entry.case]: event.target.value.trim() }))}
                          className="w-24 text-right tabular-nums"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {!planValid ? (
                <p role="alert" className="text-sm text-rose">
                  Enter a whole number between 1 and the amount you own for each case.
                </p>
              ) : null}
              {sceneToggle}
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
              <div className="flex items-center gap-4" style={caseStyle(shownCase)}>
                <CaseArt id={shownCase} size="4.5rem" float={phase === "running" && motion !== "off"} className="shrink-0" />
                <AlertDialogHeader className="min-w-0 flex-1 place-items-start! text-left!">
                  <AlertDialogTitle>{phase === "done" ? "Cases opened" : phase === "error" ? "Opening paused" : `Opening ${lootCaseInfo(shownCase).name}…`}</AlertDialogTitle>
                  <AlertDialogDescription aria-live="polite" className="tabular-nums">
                    {n(totals.opened)} of {n(planned)} opened
                    {phase !== "done" && left > 0 ? ` · ${n(left)} left` : ""}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <span className="text-2xl font-semibold text-(--case) tabular-nums">{percent}%</span>
              </div>
              <div role="progressbar" aria-label="Cases opened" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-amethyst transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${percent}%`, background: `linear-gradient(90deg, ${lootCaseInfo(shownCase).hue}, ${lootCaseInfo(shownCase).glow})` }}
                />
              </div>
              <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {(
                  [
                    ["Opened", n(totals.opened), "font-medium"],
                    ["New rewards", n(totals.newItems), "font-medium text-emerald-600 dark:text-emerald-400"],
                    ["Duplicates", n(totals.duplicates), ""],
                    ["Coins refunded", n(totals.refund), "coin-ink font-semibold"],
                  ] as const
                ).map(([label, value, tone]) => (
                  <div key={label} className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className={cn("text-base tabular-nums", tone)}>{value}</dd>
                  </div>
                ))}
              </dl>
              <RarityBreakdown counts={totals.rarities} />
              {totals.opened > 0 ? <RarePulls pulls={totals.pulls} /> : null}
              {phase === "running" ? sceneToggle : null}
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
      {cutscene ? <PullCutscene rarity={cutscene.rarity} name={cutscene.name} onDone={endScene} /> : null}
    </>
  );
}

function RarityBreakdown({ counts }: { counts: Partial<Record<RarityId, number>> }) {
  const rows = RARITY_IDS.filter((rarity) => counts[rarity]);
  if (!rows.length) return null;
  return (
    <div className="grid gap-2">
      <div aria-hidden className="flex h-2.5 gap-px overflow-hidden rounded-full bg-muted">
        {rows.map((rarity) => (
          <span key={rarity} className="h-full min-w-0.5 transition-[flex-grow] duration-300 motion-reduce:transition-none" style={{ flexGrow: counts[rarity], background: RARITIES[rarity].color }} />
        ))}
      </div>
      <ul aria-label="Pulls by rarity" className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {[...rows].reverse().map((rarity) => (
          <li key={rarity} className="flex items-center gap-1.5">
            <span aria-hidden className="size-2 rounded-full" style={{ background: RARITIES[rarity].color }} />
            <span className="text-muted-foreground">{RARITIES[rarity].label}</span>
            <span className="font-medium tabular-nums">{n(counts[rarity] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RarePulls({ pulls }: { pulls: Pull[] }) {
  return (
    <section aria-label="Rare pulls" className="grid gap-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Secret or rarer · {n(pulls.length)}</h3>
      {pulls.length ? (
        <ul className="grid max-h-40 gap-1 overflow-y-auto pr-1">
          {pulls.slice(0, SHOWN_PULLS).map((pull, at) => (
            <li key={`${pull.item}-${at}`} className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1 text-sm">
              <RarityTag rarity={pull.rarity} />
              <span className="min-w-0 flex-1 truncate">{pullName(pull)}</span>
              <span className={cn("text-xs", pull.duplicate ? "text-muted-foreground" : "font-medium text-emerald-600 dark:text-emerald-400")}>{pull.duplicate ? "Duplicate" : "New"}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">None yet.</p>
      )}
      {pulls.length > SHOWN_PULLS ? <p className="text-xs text-muted-foreground">+{n(pulls.length - SHOWN_PULLS)} more</p> : null}
    </section>
  );
}

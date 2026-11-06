"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, FastForward, Gift, Loader2, Lock, PackageOpen, RotateCcw, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ItemArt, toneOf, toneStyle, type ArtProfile, type ArtSamples } from "@/components/inventory/item-art";
import { useMotionLevel } from "@/components/showcase/motion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, apiFetch } from "@/lib/api-client";
import type { InventoryType } from "@/lib/inventory";
import { OPEN_BATCH, OPEN_PRESETS, caseOdds, lootCaseInfo, typeLabel, type LootCase, type LootClaim, type LootOpening, type LootResult, type RefundRates } from "@/lib/lootboxes";
import { RARITIES, rarityRank, type RarityId } from "@/lib/rarities";
import { cn } from "@/lib/utils";
import { CaseArt, DUPLICATE_NOTE, OddsList, RarityTag, RefundRateList, TypeIcon, caseStyle, rarityStyle, rewardItem } from "./parts";
import { CloverField, LuckBadge } from "./booster-parts";
import { LUCK_NO_GUARANTEE } from "./booster-shop";
import { boostedOpenings, luckColor, type Boost } from "@/lib/boosters";

const CosmeticPreview = dynamic(() => import("@/components/arcade/shop/preview").then((mod) => mod.CosmeticPreview), {
  ssr: false,
  loading: () => <Skeleton className="mx-auto aspect-[4/3] w-full max-w-[22rem] rounded-xl" />,
});

export type OpenPlan = { kind: "new"; caseId: string } | { kind: "resume"; openings: LootOpening[] };

type Tile = { item: string | null; kind: InventoryType | null; rarity: RarityId; name: string };
type Lane = { tiles: Tile[]; win: number; jitter: number };
type Phase = "pick" | "intro" | "opening" | "rolling" | "showcase" | "claiming" | "error" | "done";

const LANE_TILES = 42;
const WIN_AT = 35;

const tileOf = (item: string | null, kind: InventoryType | null, rarity: RarityId): Tile => ({
  item,
  kind,
  rarity,
  name: item ? (rewardItem({ item, rarity })?.name ?? item) : "Secret item",
});

/** A reel strip of decoys drawn from the case's own odds (at the result's luck), with the stored result placed under the marker. */
function buildLane(result: LootResult, lootCase: LootCase | undefined): Lane {
  const odds = lootCase ? caseOdds(lootCase.tiers, result.luck) : [];
  const decoy = (): Tile => {
    let roll = Math.random();
    const tier = odds.find((entry) => (roll -= entry.chance) < 0) ?? odds[0];
    if (!tier) return tileOf(result.item, result.kind, result.rarity);
    const entry = tier.items[Math.floor(Math.random() * tier.items.length)];
    return tileOf(entry.id, entry.kind, tier.rarity);
  };
  const tiles = Array.from({ length: LANE_TILES }, (_, index) => (index === WIN_AT ? tileOf(result.item, result.kind, result.rarity) : decoy()));
  return { tiles, win: WIN_AT, jitter: (Math.random() - 0.5) * 0.6 };
}

function openError(error: unknown): { message: string; retry: boolean } {
  if (error instanceof ApiError) {
    if (error.code === "not_enough_cases") return { message: "You don’t have enough of these cases left, so this batch wasn’t opened.", retry: false };
    if (error.status >= 400 && error.status < 500 && error.status !== 408 && error.status !== 429) return { message: error.message, retry: false };
  }
  return { message: "The connection dropped before the cases opened. Try again: the same batch is resumed and never opened twice.", retry: true };
}

function RewardArt({ result, profile, samples }: { result: LootResult; profile: ArtProfile; samples: ArtSamples }) {
  const effects = useMotionLevel();
  const item = rewardItem(result);
  if (!item) {
    return (
      <span className="grid size-24 place-items-center rounded-3xl border border-border bg-card text-(--rarity)">
        <TypeIcon kind={result.kind} className="size-10" />
      </span>
    );
  }
  if (item.type === "game") {
    return (
      <span className="block w-full max-w-[22rem]">
        <CosmeticPreview game={item.game} look={{ [item.category]: item.slug }} focus={item.category} effects={effects} />
      </span>
    );
  }
  return (
    <span className="grid place-items-center" style={toneStyle(toneOf(item))}>
      <ItemArt item={item} profile={profile} samples={samples} large />
    </span>
  );
}

function Status({ result }: { result: LootResult }) {
  return result.duplicate ? (
    <span className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      Already owned{result.refund > 0 ? ` · +${result.refund.toLocaleString("en")} Coins refund` : ""}
    </span>
  ) : (
    <span className="rounded-full border border-amethyst/50 bg-amethyst/15 px-2 py-0.5 text-[11px] font-semibold text-amethyst">New</span>
  );
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The opening overlay. Results are rolled and stored by the server before anything animates; the reel only
 * lands on them. Batches of up to ten run one after another until the request is done or stopped.
 */
export function CaseOpening({
  plan,
  cases,
  refundRates,
  boost: initialBoost,
  profile,
  samples,
  onClose,
}: {
  plan: OpenPlan;
  cases: LootCase[];
  refundRates: RefundRates;
  boost: Boost;
  profile: ArtProfile;
  samples: ArtSamples;
  onClose: () => void;
}) {
  const router = useRouter();
  const motion = useMotionLevel();
  const caseFor = (id: string) => cases.find((entry) => entry.id === id);
  const newCase = plan.kind === "new" ? caseFor(plan.caseId) : undefined;

  const [phase, setPhase] = useState<Phase>(plan.kind === "new" ? "pick" : "intro");
  const [amount, setAmount] = useState("1");
  const [owned, setOwned] = useState(newCase?.quantity ?? 0);
  const [total, setTotal] = useState(0);
  const [queue, setQueue] = useState(0);
  const [batch, setBatch] = useState(0);
  const [saved, setSaved] = useState(plan.kind === "resume" ? plan.openings : []);
  const savedTotal = plan.kind === "resume" ? plan.openings.length : 0;
  const [opening, setOpening] = useState<LootOpening | null>(null);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [landed, setLanded] = useState(false);
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<LootResult[]>([]);
  const [refunded, setRefunded] = useState(0);
  const [error, setError] = useState<{ message: string; retry: "open" | "claim" | null } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [boost, setBoost] = useState(initialBoost);
  const stoppedRef = useRef(false);
  const pendingOpen = useRef<{ id: string; quantity: number } | null>(null);
  const busy = useRef(false);
  const reels = useRef<HTMLDivElement>(null);

  const caseId = opening?.case ?? (plan.kind === "new" ? plan.caseId : (plan.openings[0]?.case ?? "release"));
  const info = lootCaseInfo(caseId);

  useEffect(() => {
    if (phase !== "rolling" || !reels.current) return;
    let timer = 0;
    const strips = Array.from(reels.current.querySelectorAll<HTMLElement>(".lb-strip"));
    const animations = strips.map((strip, lane) => {
      const tile = strip.children[lanes[lane]?.win ?? WIN_AT] as HTMLElement | undefined;
      const reel = strip.parentElement;
      const target = reel && tile ? reel.clientWidth / 2 - (tile.offsetLeft + tile.offsetWidth / 2 + (lanes[lane]?.jitter ?? 0) * tile.offsetWidth) : 0;
      return strip.animate([{ transform: "translateX(0)" }, { transform: `translateX(${target}px)` }], {
        duration: 4300 + lane * 170,
        easing: "cubic-bezier(0.08, 0.72, 0.14, 1)",
        fill: "forwards",
      });
    });
    Promise.all(animations.map((animation) => animation.finished)).then(
      () => {
        setLanded(true);
        timer = window.setTimeout(() => setPhase("showcase"), 950);
      },
      () => undefined,
    );
    return () => {
      window.clearTimeout(timer);
      animations.forEach((animation) => animation.cancel());
    };
  }, [phase, lanes]);

  function reveal(next: LootOpening) {
    setOpening(next);
    setIndex(0);
    setLanded(false);
    setLanes(next.results.map((result) => buildLane(result, caseFor(next.case))));
    setPhase(motion === "off" ? "showcase" : "rolling");
  }

  async function openBatch(left: number) {
    if (plan.kind !== "new" || busy.current) return;
    busy.current = true;
    const request = pendingOpen.current ?? { id: crypto.randomUUID(), quantity: Math.min(OPEN_BATCH, left) };
    pendingOpen.current = request;
    setQueue(left - request.quantity);
    setError(null);
    setPhase("opening");
    try {
      const result = await apiFetch<LootOpening>("/api/lootboxes/open", { method: "POST", json: { opening: request.id, case: plan.caseId, quantity: request.quantity } });
      pendingOpen.current = null;
      if (typeof result.remaining === "number") setOwned(result.remaining);
      if (result.boost) setBoost(result.boost);
      setBatch((count) => count + 1);
      reveal(result);
    } catch (caught) {
      const problem = openError(caught);
      if (!problem.retry) {
        pendingOpen.current = null;
        setQueue(0);
      }
      setError({ message: problem.message, retry: problem.retry ? "open" : null });
      setPhase("error");
    } finally {
      busy.current = false;
    }
  }

  function advance(rest: LootOpening[], left: number) {
    if (rest.length) {
      setSaved(rest.slice(1));
      reveal(rest[0]);
    } else if (left > 0 && !stoppedRef.current) {
      void openBatch(left);
    } else {
      setPhase("done");
    }
  }

  async function claim(ids: string[], results: LootResult[], rest: LootOpening[]) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    setPhase("claiming");
    try {
      const claimed = await apiFetch<LootClaim>("/api/lootboxes/claim", { method: "POST", json: { openings: ids } });
      setHistory((current) => [...current, ...results]);
      setRefunded((sum) => sum + claimed.refund);
      if (claimed.refund > 0) window.dispatchEvent(new CustomEvent("archive:coins", { detail: claimed.balance }));
      setOpening(null);
      router.refresh();
      busy.current = false;
      advance(rest, queue);
    } catch (caught) {
      busy.current = false;
      setError({
        message: caught instanceof ApiError && caught.status > 0 && caught.status < 500 ? caught.message : "Your rewards are saved but couldn’t be claimed yet. Try again; nothing is claimed twice.",
        retry: "claim",
      });
      setPhase("error");
    }
  }

  const claimCurrent = () => opening && void claim([opening.id], opening.results, saved);
  const claimAllSaved = () => void claim(saved.map((entry) => entry.id), saved.flatMap((entry) => entry.results), []);

  function start() {
    const wanted = Number(amount);
    if (!/^\d+$/.test(amount.trim()) || wanted < 1 || wanted > owned) return;
    setTotal(wanted);
    void openBatch(wanted);
  }

  function stop() {
    stoppedRef.current = true;
    setStopped(true);
  }

  function close(open: boolean) {
    if (open) return;
    if (opening && !opening.claimed && phase !== "done") toast.info("Your rewards are saved. Reveal and claim them from your Inventory any time.");
    else if (phase === "opening") toast.info("Anything already opened is saved in your Inventory.");
    if (history.length || phase !== "pick") router.refresh();
    onClose();
  }

  const results = opening?.results ?? [];
  const current = results[index];
  const last = index >= results.length - 1;
  const batchLuck = Math.max(1, ...results.map((result) => result.luck));
  const onKey = (event: KeyboardEvent) => {
    if (phase !== "showcase") return;
    if (event.key === "ArrowRight" && !last) setIndex(index + 1);
    if (event.key === "ArrowLeft" && index > 0) setIndex(index - 1);
  };

  const totalBatches = Math.ceil(total / OPEN_BATCH);
  const progress =
    plan.kind === "resume"
      ? opening
        ? `Saved opening ${savedTotal - saved.length} of ${savedTotal}`
        : null
      : batch > 0
        ? `Batch ${batch} of ${stopped ? batch : totalBatches}${queue > 0 ? ` · ${plural(queue, "case")} ${stopped ? "kept in your Inventory" : "still to open"}` : ""}`
        : null;

  const parsedAmount = /^\d+$/.test(amount.trim()) ? Number(amount) : NaN;
  const amountError = !Number.isInteger(parsedAmount) || parsedAmount < 1 ? "Enter a whole number of cases." : parsedAmount > owned ? `You have ${plural(owned, "case")}.` : null;

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-3xl" style={caseStyle(caseId)} onKeyDown={onKey}>
        <div className="flex flex-wrap items-start gap-3 pr-8">
          <CaseArt id={caseId} size="2.75rem" />
          <div className="min-w-0 flex-1">
            <DialogTitle>{phase === "done" ? "Rewards claimed" : phase === "intro" ? "Saved rewards" : `Open ${info.name}`}</DialogTitle>
            <DialogDescription aria-live="polite">{progress ?? (phase === "pick" ? `You have ${plural(owned, "case")} to open.` : "")}</DialogDescription>
          </div>
          {plan.kind === "new" && queue > 0 && !stopped && phase !== "done" && phase !== "pick" ? (
            <Button variant="outline" size="sm" onClick={stop}>
              <Square aria-hidden />
              Stop after this batch
            </Button>
          ) : null}
        </div>

        {phase === "pick" ? (
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              start();
            }}
          >
            <div className={cn("lb-stage grid place-items-center py-8", boost.luck > 1 && "bx-boosted")}>
              {boost.luck > 1 ? <CloverField color={luckColor(boost.luck, boost.boosters)} /> : null}
              <CaseArt id={caseId} size="9rem" float />
            </div>
            {boost.luck > 1 && newCase ? (
              <div className="grid gap-2 rounded-xl border border-border px-3 py-3 text-xs leading-5 text-muted-foreground">
                <span className="flex flex-wrap items-center gap-2">
                  <LuckBadge luck={boost.luck} tiers={boost.boosters} />
                  <span>
                    Luck Boosters apply to your next {plural(boostedOpenings(boost), "case")} opened, in order. {LUCK_NO_GUARANTEE}
                  </span>
                </span>
                <details>
                  <summary className="cursor-pointer font-medium text-foreground">Boosted odds for the next case</summary>
                  <div className="mt-2">
                    <OddsList tiers={newCase.tiers} luck={boost.luck} />
                  </div>
                </details>
              </div>
            ) : null}
            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">How many to open?</legend>
              <div className="flex flex-wrap items-center gap-2">
                {OPEN_PRESETS.map((preset) => (
                  <Button key={preset} type="button" variant={parsedAmount === preset ? "default" : "outline"} size="sm" aria-pressed={parsedAmount === preset} disabled={preset > owned} onClick={() => setAmount(String(preset))}>
                    {preset}
                  </Button>
                ))}
                <label htmlFor="lb-custom" className="ml-1 text-xs text-muted-foreground">
                  Custom
                </label>
                <Input
                  id="lb-custom"
                  inputMode="numeric"
                  autoComplete="off"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-invalid={amountError !== null}
                  aria-describedby="lb-custom-hint"
                  className="w-20 text-center tabular-nums"
                />
                <Button type="button" variant="ghost" size="sm" disabled={owned < 1} onClick={() => setAmount(String(owned))}>
                  All ({owned})
                </Button>
              </div>
              <p id="lb-custom-hint" aria-live="polite" className={cn("text-xs", amountError ? "text-rose" : "text-muted-foreground")}>
                {amountError ??
                  (parsedAmount > OPEN_BATCH
                    ? `Opens in ${Math.ceil(parsedAmount / OPEN_BATCH)} batches of up to ${OPEN_BATCH}, one after another. You can stop before the next batch starts.`
                    : "Rewards are rolled and saved the moment you open, so nothing is lost if you leave.")}
              </p>
            </fieldset>
            <div className="grid gap-2 rounded-xl border border-border px-3 py-3">
              <p className="text-xs text-muted-foreground">Already-owned rewards refund this share of the price you paid for the case:</p>
              <RefundRateList rates={refundRates} />
            </div>
            <Button type="submit" disabled={amountError !== null} className="justify-self-end">
              <PackageOpen aria-hidden />
              {amountError ? "Open" : `Open ${plural(parsedAmount, "case")}`}
            </Button>
          </form>
        ) : null}

        {phase === "intro" ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Rewards from {plural(saved.reduce((sum, entry) => sum + entry.results.length, 0), "case")} you opened earlier are saved and waiting. Reveal them now, or claim them straight away.
            </p>
            <div className="lb-stage grid place-items-center py-8">
              <CaseArt id={caseId} size="8rem" float />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={claimAllSaved}>
                <FastForward aria-hidden />
                Skip showcase and claim all
              </Button>
              <Button onClick={() => advance(saved, 0)}>
                <Gift aria-hidden />
                Reveal rewards
              </Button>
            </div>
          </div>
        ) : null}

        {phase === "opening" || phase === "claiming" ? (
          <div role="status" className="lb-stage grid place-items-center gap-3 py-12 text-sm text-muted-foreground">
            <CaseArt id={caseId} size="7rem" float />
            <span className="flex items-center gap-2">
              <Loader2 aria-hidden className="size-4 animate-spin" />
              {phase === "opening" ? "Opening cases…" : "Claiming rewards…"}
            </span>
          </div>
        ) : null}

        {phase === "rolling" ? (
          <div className="grid gap-3">
            <div className={cn("lb-stage", batchLuck > 1 && "bx-boosted")}>
              {batchLuck > 1 ? <CloverField color={luckColor(batchLuck, boost.boosters)} /> : null}
              <div ref={reels} aria-hidden className="lb-reels" data-compact={lanes.length > 1 || undefined}>
                {lanes.map((lane, laneIndex) => (
                  <div key={laneIndex} className="lb-reel" data-landed={landed || undefined}>
                    <div className="lb-strip">
                      {lane.tiles.map((tile, tileIndex) => (
                        <span key={tileIndex} className="lb-tile" style={rarityStyle(tile.rarity)} data-win={tileIndex === lane.win || undefined}>
                          {tile.item ? <TypeIcon kind={tile.kind} className="size-5 shrink-0" /> : <Lock className="size-5 shrink-0" />}
                          <span className="lb-tile-name">{tile.name}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <p className="sr-only" role="status">
              Rolling {plural(lanes.length, "case")}.
            </p>
            <Button variant="outline" className="justify-self-center" onClick={() => setPhase("showcase")}>
              <FastForward aria-hidden />
              Skip to rewards
            </Button>
          </div>
        ) : null}

        {phase === "showcase" && current ? (
          <div className="grid gap-4">
            <div className={cn("lb-show", current.luck > 1 && "bx-boosted")} style={rarityStyle(current.rarity)}>
              {current.luck > 1 ? <CloverField color={luckColor(current.luck, boost.boosters)} /> : null}
              <div key={`${opening?.id}-${index}`} className="relative grid w-full justify-items-center gap-4">
                <div className="lb-show-art" aria-hidden>
                  <RewardArt result={current} profile={profile} samples={samples} />
                </div>
                <div className="lb-show-text grid justify-items-center gap-1.5 text-center" aria-live="polite">
                  <p className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{rewardItem(current)?.name ?? current.item}</p>
                  <p className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span>{typeLabel(current.kind)}</span>
                    <RarityTag rarity={current.rarity} />
                    <Status result={current} />
                    {current.luck > 1 ? <LuckBadge luck={current.luck} tiers={boost.boosters} /> : null}
                  </p>
                </div>
              </div>
            </div>

            {results.length > 1 ? (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <Button variant="outline" size="icon" aria-label="Previous reward" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                    <ChevronLeft aria-hidden />
                  </Button>
                  <span className="text-sm font-medium tabular-nums" aria-live="polite">
                    {index + 1} of {results.length}
                  </span>
                  <Button variant="outline" size="icon" aria-label="Next reward" disabled={last} onClick={() => setIndex(index + 1)}>
                    <ChevronRight aria-hidden />
                  </Button>
                </div>
                <div role="group" aria-label="Rewards in this batch" className="flex flex-wrap justify-center gap-1.5">
                  {results.map((result, resultIndex) => (
                    <button
                      key={resultIndex}
                      type="button"
                      className="lb-thumb"
                      style={rarityStyle(result.rarity)}
                      aria-current={resultIndex === index}
                      aria-label={`${resultIndex + 1}: ${rewardItem(result)?.name ?? result.item}, ${RARITIES[result.rarity].label}`}
                      onClick={() => setIndex(resultIndex)}
                    >
                      <TypeIcon kind={result.kind} className="size-4" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {results.some((result) => result.duplicate) ? <p className="text-xs leading-5 text-muted-foreground">{DUPLICATE_NOTE}</p> : null}

            <div className="flex flex-wrap justify-end gap-2">
              {!last ? (
                <>
                  <Button variant="outline" onClick={claimCurrent}>
                    <FastForward aria-hidden />
                    Skip showcase and claim all
                  </Button>
                  <Button onClick={() => setIndex(index + 1)}>
                    Next
                    <ChevronRight aria-hidden />
                  </Button>
                </>
              ) : (
                <Button onClick={claimCurrent}>
                  <Gift aria-hidden />
                  {results.length > 1 ? `Claim ${results.length} rewards` : "Claim reward"}
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {phase === "error" && error ? (
          <div role="alert" className="grid justify-items-center gap-3 rounded-xl border border-rose/40 bg-rose/[0.06] px-5 py-8 text-center">
            <TriangleAlert aria-hidden className="size-6 text-rose" />
            <p className="max-w-md text-sm">{error.message}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {error.retry === "open" ? (
                <Button onClick={() => void openBatch(queue + (pendingOpen.current?.quantity ?? 0))}>
                  <RotateCcw aria-hidden />
                  Try again
                </Button>
              ) : null}
              {error.retry === "claim" && opening ? (
                <Button onClick={claimCurrent}>
                  <RotateCcw aria-hidden />
                  Try claiming again
                </Button>
              ) : null}
              {error.retry === "claim" && !opening ? (
                <Button onClick={claimAllSaved}>
                  <RotateCcw aria-hidden />
                  Try claiming again
                </Button>
              ) : null}
              {history.length ? (
                <Button variant="outline" onClick={() => setPhase("done")}>
                  See claimed rewards
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {phase === "done" ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              {plural(history.length, "reward")} claimed: {history.filter((result) => !result.duplicate).length} new, {history.filter((result) => result.duplicate).length} already owned
              {refunded > 0 ? `, ${refunded.toLocaleString("en")} Coins refunded` : ""}.
              {stopped && queue > 0 ? ` ${plural(queue, "case")} stayed in your Inventory.` : ""}
            </p>
            {history.length ? (
              <ul className="grid max-h-[50dvh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {history
                  .map((result, order) => ({ result, order }))
                  .sort((a, b) => rarityRank(b.result.rarity) - rarityRank(a.result.rarity) || a.order - b.order)
                  .map(({ result, order }) => (
                    <li key={order} className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2" style={rarityStyle(result.rarity)}>
                      <span className="lb-thumb shrink-0">
                        <TypeIcon kind={result.kind} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{rewardItem(result)?.name ?? result.item}</span>
                        <span className="text-[11px] text-muted-foreground">{typeLabel(result.kind)}</span>
                      </span>
                      <span className="grid justify-items-end gap-1">
                        <RarityTag rarity={result.rarity} />
                        {result.duplicate ? (
                          <span className="text-[10px] text-muted-foreground">Already owned{result.refund > 0 ? ` · +${result.refund.toLocaleString("en")}` : ""}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
            <Button className="justify-self-end" onClick={() => close(false)}>
              Done
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

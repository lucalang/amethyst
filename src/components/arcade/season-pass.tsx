"use client";

import "./season-pass.css";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs as TabsPrimitive } from "radix-ui";
import { toast } from "sonner";
import { Check, ChevronLeft, ChevronRight, ChevronsUp, Coins, Crown, Gift, Loader2, Lock, Minus, Play, Plus, RotateCcw, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
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
import { ItemArt, type ArtProfile, type ArtSamples } from "@/components/inventory/item-art";
import { ApiError, apiFetch } from "@/lib/api-client";
import { describeItem, inventoryItemLabel } from "@/lib/inventory";
import { RARITIES } from "@/lib/rarities";
import { CADENCE_LABELS, QUEST_CADENCES, questHref, questTitle, seasonInfo, type SeasonQuest, type SeasonReward, type SeasonState } from "@/lib/season-pass";

type Season = NonNullable<SeasonState["season"]>;
type Progress = NonNullable<SeasonState["progress"]>;
export type SeasonTab = "pass" | "quests";

const coinsText = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;
const plural = (count: number, word: string) => `${count.toLocaleString("en")} ${word}${count === 1 ? "" : "s"}`;

const subscribeSecond = (onChange: () => void) => {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
};
const nowSecond = () => Math.floor(Date.now() / 1000);

/** Time left until a quest reset, ticking each second. */
function TimeLeft({ to, prefix }: { to: string; prefix: string }) {
  const second = useSyncExternalStore(subscribeSecond, nowSecond, () => 0);
  if (!second) return null;
  const left = Math.max(0, Math.floor(Date.parse(to) / 1000) - second);
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  const m = Math.floor((left % 3600) / 60);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    <span className="tabular-nums">
      {prefix} {d ? `${d}d ${h}h` : `${h}:${pad(m)}:${pad(left % 60)}`}
    </span>
  );
}

function actionError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "insufficient_funds":
        return "You don’t have enough coins, so nothing was bought and no coins were taken. Complete quests and play Arcade games to earn more.";
      case "price_changed":
        return "The price just changed, so nothing was bought and no coins were taken. Check the new price and try again.";
      case "season_closed":
        return "This season is over, so Premium and tier skips are no longer on sale. No coins were taken.";
      case "too_many_tiers":
        return "That’s more tiers than are left in this season. No coins were taken.";
      case "quest_incomplete":
        return "This quest isn’t complete yet.";
      case "quest_not_found":
        return "This quest is no longer available.";
      default:
        return error.status >= 500 ? `${fallback} Try again in a moment.` : error.message;
    }
  }
  return "The Season Pass couldn’t be reached, so this wasn’t confirmed. It’s safe to try again: nothing is ever granted or charged twice.";
}

type Dialog = { mode: "premium"; error?: string | null } | { mode: "skip"; tiers: number; request: string; error?: string | null } | { mode: "done"; title: string; text: string };

/** The Season Pass: the season, its reward track and its quests in one stage; claims, Premium and tier skips happen on the pass itself. */
export function SeasonPass({ state: initial, profile, samples, tab: initialTab }: { state: SeasonState | null; profile: ArtProfile; samples: ArtSamples; tab: SeasonTab }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [state, setState] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setState(initial);
  }
  const [tab, setTab] = useState<SeasonTab>(initialTab);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (!celebrate) return;
    const id = window.setTimeout(() => setCelebrate(false), 2600);
    return () => window.clearTimeout(id);
  }, [celebrate]);

  if (!state) {
    return (
      <div role="alert" className="ui-panel enter mx-auto max-w-md px-6 py-10 text-center" data-glow style={{ "--tone": "var(--rose)" } as CSSProperties}>
        <span aria-hidden className="ui-hero-icon mx-auto">
          <TriangleAlert className="size-5" />
        </span>
        <h1 className="mt-4 text-base font-semibold">The Season Pass couldn’t be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">Your progress, quests and coins are safe. Try again in a moment.</p>
        <Button className="mt-5" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
          {retrying ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  const season = state.season;
  const progress = state.progress;
  if (!season || !progress) {
    return (
      <div className="sp enter">
        <div className="sp-stage px-6 py-16 text-center">
          <Sparkles aria-hidden className="mx-auto size-9 text-[var(--season-glow)]" />
          <h1 className="mt-4 text-xl font-semibold text-white">No season is running right now</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-white/60">The next season, its reward track and its quests will appear here. Arcade games still earn coins in the meantime.</p>
          <Button asChild className="mt-6" variant="outline">
            <Link href="/arcade">Go to the Arcade</Link>
          </Button>
        </div>
      </div>
    );
  }

  const info = seasonInfo(season.id);
  const balance = state.balance;
  const maxed = progress.tier >= season.tierCount;
  const intoTier = maxed ? season.xpPerTier : progress.xp % season.xpPerTier;
  const claimable = state.rewards.filter((reward) => !reward.claimed && reward.tier <= progress.tier && (reward.track === "free" || progress.premium));
  const skipLeft = Math.max(0, season.tierCount - progress.tier);
  const now = Date.parse(state.now);
  const ended = !season.active && Date.parse(season.endsAt) <= now;
  const readyQuests = state.quests.filter((quest) => !quest.claimedAt && quest.progress >= quest.target).length;

  async function run<T extends { balance?: number }>(key: string, json: Record<string, unknown>, fallback: string): Promise<T | string> {
    if (inFlight.current) return fallback;
    inFlight.current = true;
    setBusy(key);
    try {
      const response = await apiFetch<{ result: T; state: SeasonState | null }>("/api/season-pass", { method: "POST", json });
      if (response.state) setState(response.state);
      else router.refresh();
      if (typeof response.result.balance === "number") window.dispatchEvent(new CustomEvent("archive:coins", { detail: response.result.balance }));
      return response.result;
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) router.refresh();
      return actionError(error, fallback);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function claimQuest(quest: SeasonQuest) {
    const result = await run<{ xp: number; coins: number; balance: number }>(`quest:${quest.id}`, { action: "quest", assignment: quest.id, season: season!.id }, "The quest couldn’t be claimed.");
    if (typeof result === "string") toast.error(result);
    else toast.success(`Quest complete: +${result.xp.toLocaleString("en")} Season XP and +${coinsText(result.coins)}`);
  }

  async function claimRewards() {
    const result = await run<{ claimed: number; items: number; coins: number; balance: number }>("rewards", { action: "rewards", season: season!.id }, "The rewards couldn’t be claimed.");
    if (typeof result === "string") toast.error(result);
    else if (!result.claimed) toast.info("Everything you’ve reached is already claimed.");
    else
      toast.success(
        `${plural(result.claimed, "reward")} claimed${result.items ? `: ${plural(result.items, "item")} added to your Inventory` : ""}${result.coins ? `, +${coinsText(result.coins)}` : ""}`,
      );
  }

  async function buyPremium() {
    const result = await run<{ status: string; balance: number }>("premium", { action: "premium", season: season!.id, price: season!.premiumPrice }, "The purchase didn’t go through, and no coins were taken.");
    if (typeof result === "string") return setDialog({ mode: "premium", error: result });
    setDialog(null);
    if (result.status === "owned") toast.info("You already have Premium for this season, so no coins were taken.");
    else setUnlocking(true);
  }

  async function skip(tiers: number, request: string) {
    const cost = tiers * season!.skipPrice;
    const result = await run<{ status: string; tier: number; balance: number }>("skip", { action: "skip", request, season: season!.id, tiers, cost }, "The purchase didn’t go through, and no coins were taken.");
    if (typeof result === "string") setDialog({ mode: "skip", tiers, request, error: result });
    else
      setDialog({
        mode: "done",
        title: `Tier ${result.tier} reached`,
        text: result.status === "repeat" ? "This skip was already applied, so no coins were taken again." : `${coinsText(cost)} spent on ${plural(tiers, "tier")}.`,
      });
  }

  const openSkip = (tiers = 1) => setDialog({ mode: "skip", tiers, request: crypto.randomUUID() });
  const changeTab = (value: string) => {
    const next = value === "quests" ? "quests" : "pass";
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "quests") url.searchParams.set("tab", "quests");
    else url.searchParams.delete("tab");
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <div className="sp grid gap-5" style={{ "--season": info.hue, "--season-glow": info.glow } as CSSProperties}>
      {state.otherSeasons.some((other) => other.claimable > 0) ? (
        <div role="status" className="ui-panel enter flex flex-wrap items-center gap-3 px-4 py-3 text-sm" data-glow>
          <span aria-hidden className="ui-icon ui-icon-sm">
            <Gift className="size-4" />
          </span>
          <span className="min-w-0 flex-1">You have unclaimed rewards from another season. Earned rewards never expire.</span>
          {state.otherSeasons
            .filter((other) => other.claimable > 0)
            .map((other) => (
              <Button key={other.id} asChild size="sm" variant="outline">
                <Link href={`/arcade/season?season=${encodeURIComponent(other.id)}`}>
                  {seasonInfo(other.id).name} · {other.claimable}
                </Link>
              </Button>
            ))}
        </div>
      ) : null}

      <section aria-labelledby="season-title" className="sp-stage enter" data-premium={progress.premium || undefined} data-celebrate={celebrate || undefined}>
        <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
          <div className="flex min-w-0 items-center gap-5">
            <div className="sp-emblem" style={{ "--p": maxed ? 1 : intoTier / season.xpPerTier } as CSSProperties} aria-hidden>
              <div className="sp-emblem-gem">
                <span className="sp-emblem-label">TIER</span>
                <span className="sp-emblem-num tabular-nums">{progress.tier}</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="sp-eyebrow">
                {progress.premium ? <Crown aria-hidden className="size-3.5 text-[var(--gold)]" /> : <Sparkles aria-hidden className="size-3.5" />}
                Season Pass · {info.label}
                {ended ? " · Ended" : !season.active ? " · Coming soon" : ""}
              </p>
              <h1 id="season-title" className="sp-title mt-2">
                {info.title}
              </h1>
              {info.tagline ? <p className="mt-3 max-w-xl text-sm leading-6 text-pretty text-white/65">{info.tagline}</p> : null}
            </div>
          </div>

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3 text-sm text-white">
              <span className="font-semibold">
                <span className="sr-only">Tier {progress.tier} of {season.tierCount}. </span>
                {maxed ? "Every tier reached" : `Tier ${progress.tier} → ${progress.tier + 1}`}
              </span>
              <span className="text-white/60 tabular-nums">{maxed ? `${progress.xp.toLocaleString("en")} XP` : `${intoTier.toLocaleString("en")} / ${season.xpPerTier.toLocaleString("en")} XP`}</span>
            </div>
            <div
              className="sp-xp"
              role="progressbar"
              aria-label={maxed ? "Season complete" : `Season XP toward tier ${progress.tier + 1}`}
              aria-valuemin={0}
              aria-valuemax={season.xpPerTier}
              aria-valuenow={intoTier}
            >
              <span style={{ width: `${(intoTier / season.xpPerTier) * 100}%` }} />
            </div>
            <p className="text-xs text-white/50">
              {progress.xp.toLocaleString("en")} Season XP{progress.skipped ? ` · ${plural(progress.skipped, "tier")} skipped` : ""} · {season.tierCount} tiers
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <button type="button" className="sp-btn sp-btn-claim" onClick={() => void claimRewards()} disabled={busy !== null || claimable.length === 0} aria-busy={busy === "rewards"}>
                {busy === "rewards" ? <Loader2 aria-hidden className="animate-spin" /> : <Gift aria-hidden />}
                {claimable.length ? `Claim ${plural(claimable.length, "reward")}` : "All claimed"}
              </button>
              {progress.premium ? (
                <span className="sp-premium-chip">
                  <Crown aria-hidden className="size-4" /> Premium
                </span>
              ) : season.active ? (
                <button type="button" className="sp-btn sp-btn-gold" onClick={() => setDialog({ mode: "premium" })} disabled={busy !== null}>
                  <Crown aria-hidden /> Premium · {season.premiumPrice.toLocaleString("en")}
                </button>
              ) : null}
              {season.active && skipLeft > 0 ? (
                <button type="button" className="sp-btn sp-btn-ghost" onClick={() => openSkip()} disabled={busy !== null}>
                  <ChevronsUp aria-hidden /> Skip
                </button>
              ) : null}
              <span className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums">
                <Coins aria-hidden className="coin-ink size-4" />
                <span className="coin-ink" aria-live="polite">
                  {balance.toLocaleString("en")}
                </span>
                <span className="sr-only">coins</span>
              </span>
            </div>
          </div>
        </div>

        <TabsPrimitive.Root value={tab} onValueChange={changeTab}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7">
            <TabsPrimitive.List aria-label="Season Pass sections" className="sp-tabs">
              <TabsPrimitive.Trigger value="pass" className="sp-tab">
                <Crown aria-hidden className="size-4" /> Season Pass
              </TabsPrimitive.Trigger>
              <TabsPrimitive.Trigger value="quests" className="sp-tab">
                <ScrollText aria-hidden className="size-4" /> Quests
                {readyQuests ? (
                  <span className="sp-tab-count" aria-label={`${readyQuests} ready to claim`}>
                    {readyQuests}
                  </span>
                ) : null}
              </TabsPrimitive.Trigger>
            </TabsPrimitive.List>
            {ended ? <p className="text-xs text-white/55">This season is over. Everything you reached and every completed quest can still be claimed.</p> : null}
          </div>

          <TabsPrimitive.Content value="pass" className="outline-none">
            <Track
              season={season}
              progress={progress}
              rewards={state.rewards}
              busy={busy}
              profile={profile}
              samples={samples}
              onClaim={() => void claimRewards()}
              onPremium={season.active ? () => setDialog({ mode: "premium" }) : null}
              onSkip={season.active ? (tier) => openSkip(tier - progress.tier) : null}
            />
          </TabsPrimitive.Content>
          <TabsPrimitive.Content value="quests" className="outline-none">
            <Quests quests={state.quests} now={now} active={season.active} busy={busy} onClaim={(quest) => void claimQuest(quest)} />
          </TabsPrimitive.Content>
        </TabsPrimitive.Root>
      </section>

      <AlertDialog open={dialog !== null} onOpenChange={(open) => !open && !busy && setDialog(null)}>
        <AlertDialogContent>
          {dialog?.mode === "done" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
                <AlertDialogDescription>
                  {dialog.text} Your balance is now {balance.toLocaleString("en")}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Close</AlertDialogCancel>
                {claimable.length ? (
                  <Button
                    onClick={() => {
                      setDialog(null);
                      void claimRewards();
                    }}
                  >
                    <Gift aria-hidden /> Claim {plural(claimable.length, "reward")}
                  </Button>
                ) : null}
              </AlertDialogFooter>
            </>
          ) : dialog?.mode === "premium" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Upgrade to Premium?</AlertDialogTitle>
                <AlertDialogDescription>
                  Premium adds a second cosmetic reward to all {season.tierCount} tiers of {info.name}, including tiers you’ve already reached. Coins are taken once, and Premium lasts for this season.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Receipt label="Premium Pass" total={season.premiumPrice} balance={balance} />
              {balance < season.premiumPrice ? <p className="text-sm text-rose">You need {coinsText(season.premiumPrice - balance)} more. Complete quests and play Arcade games to earn coins.</p> : null}
              {dialog.error ? (
                <p role="alert" className="text-sm text-rose">
                  {dialog.error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
                <Button onClick={() => void buyPremium()} disabled={busy !== null || balance < season.premiumPrice} aria-busy={busy === "premium"}>
                  {busy === "premium" ? <Loader2 aria-hidden className="animate-spin" /> : <Crown aria-hidden />}
                  {busy === "premium" ? "Upgrading…" : `Upgrade for ${coinsText(season.premiumPrice)}`}
                </Button>
              </AlertDialogFooter>
            </>
          ) : dialog?.mode === "skip" ? (
            <SkipDialog
              tiers={Math.min(dialog.tiers, Math.max(1, skipLeft))}
              left={skipLeft}
              tier={progress.tier}
              price={season.skipPrice}
              balance={balance}
              error={dialog.error ?? null}
              busy={busy === "skip"}
              disabled={busy !== null}
              onChange={(tiers) => openSkip(tiers)}
              onConfirm={(tiers) => void skip(tiers, dialog.request)}
            />
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      {unlocking ? (
        <PremiumUnlock
          name={info.name}
          tiers={season.tierCount}
          ready={claimable.filter((reward) => reward.track === "premium").length}
          onClose={() => {
            setUnlocking(false);
            setTab("pass");
            setCelebrate(true);
          }}
        />
      ) : null}
    </div>
  );
}

/** The reward track, scrolled sideways: Premium above the rail, Free below, one column per tier. */
function Track({
  season,
  progress,
  rewards,
  busy,
  profile,
  samples,
  onClaim,
  onPremium,
  onSkip,
}: {
  season: Season;
  progress: Progress;
  rewards: SeasonReward[];
  busy: string | null;
  profile: ArtProfile;
  samples: ArtSamples;
  onClaim: () => void;
  onPremium: (() => void) | null;
  onSkip: ((tier: number) => void) | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const maxed = progress.tier >= season.tierCount;
  const pos = maxed ? season.tierCount - 1 : progress.tier - 1 + (progress.xp % season.xpPerTier) / season.xpPerTier;
  const focusTier = Math.min(season.tierCount, progress.tier + 1);

  const scrollToTier = (tier: number, smooth: boolean) => {
    const box = scroller.current;
    const column = box?.querySelector<HTMLElement>(`[data-tier="${tier}"]`);
    if (!box || !column) return;
    box.scrollTo({ left: Math.max(0, column.offsetLeft - box.clientWidth / 3), behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    scrollToTier(focusTier, false);
    // Only on first view of a season; later progress shouldn't yank the track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season.id]);

  const page = (direction: 1 | -1) => scroller.current?.scrollBy({ left: direction * scroller.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="pt-4 pb-5">
      <div className="flex items-center justify-between gap-3 px-5 pb-2 sm:px-7">
        <p className="text-xs text-white/50">Cosmetic rewards only. Items you already own pay half their value in coins.</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" className="sp-btn sp-btn-ghost h-9 px-3 text-xs" onClick={() => scrollToTier(focusTier, true)}>
            {maxed ? `Tier ${season.tierCount}` : `Tier ${focusTier}`}
          </button>
          <button type="button" className="sp-nav-btn" aria-label="Scroll the track left" onClick={() => page(-1)}>
            <ChevronLeft aria-hidden className="size-4" />
          </button>
          <button type="button" className="sp-nav-btn" aria-label="Scroll the track right" onClick={() => page(1)}>
            <ChevronRight aria-hidden className="size-4" />
          </button>
        </div>
      </div>
      <div ref={scroller} className="sp-scroller" role="region" aria-label="Reward track" tabIndex={0}>
        <div className="sp-lane" style={{ "--pos": pos } as CSSProperties}>
          <div aria-hidden className="sp-legend">
            <span className="text-[var(--gold-soft)]">
              <Crown className="size-3" /> Premium
            </span>
            <span />
            <span className="text-white/60">Free</span>
          </div>
          <span aria-hidden className="sp-rail" />
          <span aria-hidden className="sp-rail-fill" />
          {Array.from({ length: season.tierCount }, (_, index) => index + 1).map((tier) => {
            const reached = tier <= progress.tier;
            const current = tier === progress.tier;
            const free = rewards.find((reward) => reward.tier === tier && reward.track === "free");
            const premium = rewards.find((reward) => reward.tier === tier && reward.track === "premium");
            return (
              <div key={tier} role="group" aria-label={`Tier ${tier}${reached ? ", reached" : ""}`} className="sp-col" data-tier={tier}>
                <RewardCard reward={premium} tier={tier} reached={reached} unlocked={progress.premium} busy={busy} index={tier} profile={profile} samples={samples} onClaim={onClaim} onPremium={onPremium} />
                {!reached && onSkip ? (
                  <button type="button" className="sp-node" onClick={() => onSkip(tier)} title={`Skip to tier ${tier}`} aria-label={`Skip to tier ${tier}`} disabled={busy !== null}>
                    <span>{tier}</span>
                  </button>
                ) : (
                  <span aria-hidden className="sp-node" data-reached={reached || undefined} data-current={current || undefined}>
                    <span>{tier}</span>
                  </span>
                )}
                <RewardCard reward={free} tier={tier} reached={reached} unlocked busy={busy} profile={profile} samples={samples} onClaim={onClaim} onPremium={null} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RewardCard({
  reward,
  tier,
  reached,
  unlocked,
  busy,
  index,
  profile,
  samples,
  onClaim,
  onPremium,
}: {
  reward: SeasonReward | undefined;
  tier: number;
  reached: boolean;
  unlocked: boolean;
  busy: string | null;
  index?: number;
  profile: ArtProfile;
  samples: ArtSamples;
  onClaim: () => void;
  onPremium: (() => void) | null;
}) {
  if (!reward) return <span aria-hidden className="rounded-2xl border border-dashed border-white/10" />;
  const item = reward.item ? describeItem(reward.item) : null;
  const premium = reward.track === "premium";
  const state = reward.claimed ? "claimed" : premium && !unlocked ? "premium-locked" : !reached ? "locked" : "ready";
  const name = item ? item.name : coinsText(reward.coins);
  const status =
    state === "claimed"
      ? reward.duplicate
        ? `Owned · +${reward.paid.toLocaleString("en")}`
        : "Claimed"
      : state === "ready"
        ? "Claim"
        : state === "premium-locked"
          ? "Premium"
          : `Tier ${tier}`;
  const StatusIcon = state === "claimed" ? Check : state === "ready" ? Gift : state === "premium-locked" ? Crown : Lock;
  const style = { "--rarity": reward.rarity ? RARITIES[reward.rarity].color : "#f59e0b", "--i": index ?? 0 } as CSSProperties;

  const body = (
    <>
      <span className="sp-card-art" aria-hidden>
        {item ? (
          <span className="pointer-events-none">
            <ItemArt item={item} profile={profile} samples={samples} />
          </span>
        ) : (
          <span className="sp-card-coins">{reward.coins}</span>
        )}
      </span>
      <span className="sp-card-body">
        {item && reward.rarity ? (
          <span className="text-[0.6rem] font-extrabold tracking-[0.18em] uppercase" style={{ color: RARITIES[reward.rarity].color }}>
            {RARITIES[reward.rarity].label} · {inventoryItemLabel(item)}
          </span>
        ) : null}
        <span className="sp-card-name">{name}</span>
        <span className="sp-card-status">
          <StatusIcon aria-hidden /> {status}
        </span>
      </span>
      {state === "premium-locked" ? (
        <span aria-hidden className="sp-card-lock">
          <Lock />
        </span>
      ) : null}
    </>
  );

  const described = `${premium ? "Premium" : "Free"} reward, tier ${tier}: ${name}${item && reward.rarity ? `, ${RARITIES[reward.rarity].label}` : ""}`;
  if (state === "ready")
    return (
      <button type="button" className="sp-card" data-state={state} data-track={reward.track} style={style} onClick={onClaim} disabled={busy !== null} aria-label={`${described}. Claim all ready rewards`}>
        {body}
      </button>
    );
  if (state === "premium-locked" && onPremium)
    return (
      <button type="button" className="sp-card" data-state={state} data-track={reward.track} style={style} onClick={onPremium} disabled={busy !== null} aria-label={`${described}. Needs Premium; upgrade`}>
        {body}
      </button>
    );
  return (
    <div className="sp-card" data-state={state} data-track={reward.track} style={style}>
      <span className="sr-only">
        {described}. {state === "claimed" ? (reward.duplicate ? `Claimed; already owned, paid ${coinsText(reward.paid)}` : "Claimed") : state === "locked" ? "Locked" : "Needs Premium"}.
      </span>
      {body}
    </div>
  );
}

function Quests({ quests, now, active, busy, onClaim }: { quests: SeasonQuest[]; now: number; active: boolean; busy: string | null; onClaim: (quest: SeasonQuest) => void }) {
  const earlier = quests.filter((quest) => Date.parse(quest.periodEnd) <= now);
  const current = quests.filter((quest) => Date.parse(quest.periodEnd) > now);
  return (
    <div className="grid gap-6 px-5 pt-5 pb-7 sm:px-7">
      <p className="text-sm text-white/60">Quests track your finished Arcade runs automatically. Claim them for Season XP and coins. Completed quests stay claimable after they reset.</p>
      {earlier.length ? <QuestGroup title="Ready from earlier" note="Completed before the last reset" quests={earlier} busy={busy} onClaim={onClaim} /> : null}
      {QUEST_CADENCES.map((cadence) => {
        const group = current.filter((quest) => quest.cadence === cadence);
        const resets = group[0]?.periodEnd;
        return (
          <QuestGroup
            key={cadence}
            title={CADENCE_LABELS[cadence].title}
            note={resets && cadence !== "season" ? <TimeLeft to={resets} prefix="New quests in" /> : CADENCE_LABELS[cadence].reset}
            quests={group}
            busy={busy}
            onClaim={onClaim}
            empty={active ? "No quests right now. Check back after the next reset." : "This season’s quests have closed."}
          />
        );
      })}
    </div>
  );
}

function QuestGroup({ title, note, quests, busy, onClaim, empty }: { title: string; note: ReactNode; quests: SeasonQuest[]; busy: string | null; onClaim: (quest: SeasonQuest) => void; empty?: string }) {
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-white">{title}</h2>
        <span className="text-xs text-white/50">{note}</span>
      </div>
      {quests.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quests.map((quest, index) => {
            const done = quest.progress >= quest.target;
            const name = questTitle(quest);
            const key = `quest:${quest.id}`;
            return (
              <li key={quest.id} className="sp-quest enter enter-soft" style={{ "--enter-index": index } as CSSProperties} data-cadence={quest.cadence} data-done={(done && !quest.claimedAt) || undefined} data-claimed={quest.claimedAt ? true : undefined}>
                <span className="sp-quest-tag">{quest.cadence === "season" ? "Season" : quest.cadence === "weekly" ? "Weekly" : "Daily"}</span>
                <p className="text-sm font-semibold text-pretty text-white">{name}</p>
                <div className="flex items-center gap-2">
                  <div className="sp-quest-bar flex-1" role="progressbar" aria-label={`${name} progress`} aria-valuemin={0} aria-valuemax={quest.target} aria-valuenow={Math.min(quest.progress, quest.target)}>
                    <span style={{ width: `${Math.min(100, (quest.progress / quest.target) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-white/55 tabular-nums">
                    {Math.min(quest.progress, quest.target).toLocaleString("en")}/{quest.target.toLocaleString("en")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-3 text-xs font-bold tabular-nums">
                    <span className="text-[var(--season-glow)]">+{quest.xp.toLocaleString("en")} XP</span>
                    <span className="coin-ink inline-flex items-center gap-1">
                      <Coins aria-hidden className="size-3.5" />+{quest.coins.toLocaleString("en")}
                    </span>
                  </span>
                  {quest.claimedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-white/55">
                      <Check aria-hidden className="size-3.5" /> Claimed
                    </span>
                  ) : done ? (
                    <button type="button" className="sp-btn sp-btn-claim h-8 px-3 text-xs" onClick={() => onClaim(quest)} disabled={busy !== null} aria-busy={busy === key} aria-label={`Claim: ${name}`}>
                      {busy === key ? <Loader2 aria-hidden className="animate-spin" /> : <Gift aria-hidden />}
                      Claim
                    </button>
                  ) : (
                    <Link href={questHref(quest)} className="sp-btn sp-btn-ghost h-8 px-3 text-xs" aria-label={`Play for: ${name}`}>
                      <Play aria-hidden /> Play
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-white/50">{empty}</p>
      )}
    </section>
  );
}

function Receipt({ label, total, balance }: { label: string; total: number; balance: number }) {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{coinsText(total)}</dd>
      <dt className="text-muted-foreground">Your balance</dt>
      <dd className="text-right tabular-nums">{balance.toLocaleString("en")}</dd>
      <dt className="border-t border-border pt-1.5 font-medium text-foreground">Balance after</dt>
      <dd className="border-t border-border pt-1.5 text-right font-semibold tabular-nums">{balance >= total ? (balance - total).toLocaleString("en") : "—"}</dd>
    </dl>
  );
}

function SkipDialog({
  tiers,
  left,
  tier,
  price,
  balance,
  error,
  busy,
  disabled,
  onChange,
  onConfirm,
}: {
  tiers: number;
  left: number;
  tier: number;
  price: number;
  balance: number;
  error: string | null;
  busy: boolean;
  disabled: boolean;
  onChange: (tiers: number) => void;
  onConfirm: (tiers: number) => void;
}) {
  const cost = tiers * price;
  const short = cost > balance ? cost - balance : 0;
  const affordable = Math.min(left, Math.floor(balance / price));
  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Skip to tier {tier + tiers}?</AlertDialogTitle>
        <AlertDialogDescription>
          Each tier costs {coinsText(price)} and unlocks that tier’s rewards right away. Your Season XP is kept. {plural(left, "tier")} left this season.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="One tier fewer" disabled={disabled || tiers <= 1} onClick={() => onChange(tiers - 1)}>
          <Minus aria-hidden />
        </Button>
        <output aria-live="polite" className="min-w-24 text-center text-sm font-semibold tabular-nums">
          {plural(tiers, "tier")}
        </output>
        <Button type="button" variant="outline" size="icon" aria-label="One tier more" disabled={disabled || tiers >= left} onClick={() => onChange(tiers + 1)}>
          <Plus aria-hidden />
        </Button>
        {affordable > 1 && affordable !== tiers ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(affordable)}>
            Max affordable ({affordable})
          </Button>
        ) : null}
      </div>
      <Receipt label={`${tiers} × ${coinsText(price)}`} total={cost} balance={balance} />
      {short ? <p className="text-sm text-rose">You need {coinsText(short)} more for {tiers === 1 ? "this tier" : "these tiers"}.</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-rose">
          {error}
        </p>
      ) : null}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel>
        <Button onClick={() => onConfirm(tiers)} disabled={disabled || short > 0} aria-busy={busy}>
          {busy ? <Loader2 aria-hidden className="animate-spin" /> : <ChevronsUp aria-hidden />}
          {busy ? "Skipping…" : `Skip for ${coinsText(cost)}`}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

const SPARKS = Array.from({ length: 28 }, (_, index) => ({ a: `${index * (360 / 28)}deg`, d: `${9 + (index % 4) * 3.5}rem` }));

/** Full-screen celebration after buying Premium. */
function PremiumUnlock({ name, tiers, ready, onClose }: { name: string; tiers: number; ready: number; onClose: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => button.current?.focus(), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="sp-unlock" role="dialog" aria-modal="true" aria-labelledby="sp-unlock-title" aria-describedby="sp-unlock-text">
      <span aria-hidden className="sp-unlock-rays" />
      {[0, 1, 2].map((ring) => (
        <span key={ring} aria-hidden className="sp-unlock-ring" style={{ "--r": ring } as CSSProperties} />
      ))}
      {SPARKS.map((spark, index) => (
        <span key={index} aria-hidden className="sp-unlock-spark" style={{ "--a": spark.a, "--d": spark.d, "--s": index } as CSSProperties} />
      ))}
      <span aria-hidden className="sp-unlock-flash" />
      <div className="sp-unlock-content">
        <span aria-hidden className="sp-unlock-gem">
          <Crown strokeWidth={1.75} />
        </span>
        <h2 id="sp-unlock-title" className="sp-unlock-title">
          Premium unlocked
        </h2>
        <p id="sp-unlock-text" className="sp-unlock-rise text-sm leading-6 text-amber-50/80">
          {name} is now Premium: {tiers} extra cosmetic rewards on your track.
          {ready ? ` ${plural(ready, "Premium reward")} ${ready === 1 ? "is" : "are"} ready to claim right now.` : ""}
        </p>
        <button ref={button} type="button" className="sp-btn sp-btn-gold sp-unlock-rise mt-2 h-11 px-6" style={{ "--delay": "1.35s" } as CSSProperties} onClick={onClose}>
          <Crown aria-hidden /> See my Premium track
        </button>
      </div>
    </div>,
    document.body,
  );
}

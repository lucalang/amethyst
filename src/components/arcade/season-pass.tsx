"use client";

import { useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronsUp, Coins, Crown, Gift, Loader2, Lock, Minus, Play, Plus, RotateCcw, ScrollText, Sparkles, TriangleAlert } from "lucide-react";
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
import { RarityTag } from "@/components/lootboxes/parts";
import { ApiError, apiFetch } from "@/lib/api-client";
import { describeItem, inventoryItemLabel } from "@/lib/inventory";
import { CADENCE_LABELS, QUEST_CADENCES, questHref, questTitle, seasonInfo, type SeasonQuest, type SeasonReward, type SeasonState } from "@/lib/season-pass";
import { cn } from "@/lib/utils";

const coinsText = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;
const dateText = (iso: string) => new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const subscribeSecond = (onChange: () => void) => {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
};
const nowSecond = () => Math.floor(Date.now() / 1000);

/** Time left until `to`, ticking each second ("2d 4h", "3:04:05"). */
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

function Bar({ value, max, label, className }: { value: number; max: number; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className={cn("block h-2 overflow-hidden rounded-full bg-foreground/10", className)}>
      <span className="block h-full rounded-full bg-[var(--season,var(--amethyst))] transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
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
        return "This season has ended, so Premium and tier skips are no longer on sale. No coins were taken.";
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
  return `The Season Pass couldn’t be reached, so this wasn’t confirmed. It’s safe to try again: nothing is ever granted or charged twice.`;
}

type Dialog =
  | { mode: "premium"; error?: string | null }
  | { mode: "skip"; tiers: number; request: string; error?: string | null }
  | { mode: "done"; title: string; text: string };

/** The Season Pass page: season progress, quests, the reward track, and Premium and tier skips bought with Coins. */
export function SeasonPass({ state: initial, profile, samples }: { state: SeasonState | null; profile: ArtProfile; samples: ArtSamples }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();
  const [state, setState] = useState(initial);
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setState(initial);
  }
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);

  if (!state) {
    return (
      <div role="alert" className="enter mx-auto max-w-md rounded-2xl border border-rose/40 bg-card px-6 py-10 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose/40 bg-rose/10 text-rose">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">The Season Pass couldn’t be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your progress, quests and coins are safe. Try again in a moment.</p>
        <Button className="mt-5" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
          {retrying ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  const season = state.season;
  if (!season || !state.progress) {
    return (
      <div className="enter rounded-2xl border border-dashed border-border px-6 py-12 text-center">
        <Sparkles aria-hidden className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-3 text-base font-semibold">No season is running right now</h2>
        <p className="mt-1 text-sm text-muted-foreground">The next season and its quests will appear here. Arcade games still earn coins in the meantime.</p>
        <Button asChild className="mt-5" variant="outline">
          <Link href="/arcade">Back to the Arcade</Link>
        </Button>
      </div>
    );
  }

  const info = seasonInfo(season.id);
  const progress = state.progress;
  const balance = state.balance;
  const maxed = progress.tier >= season.tierCount;
  const intoTier = maxed ? season.xpPerTier : progress.xp % season.xpPerTier;
  const claimable = state.rewards.filter((reward) => !reward.claimed && reward.tier <= progress.tier && (reward.track === "free" || progress.premium));
  const skipLeft = Math.max(0, season.tierCount - progress.tier);
  const now = Date.parse(state.now);
  const earlier = state.quests.filter((quest) => Date.parse(quest.periodEnd) <= now);
  const current = state.quests.filter((quest) => Date.parse(quest.periodEnd) > now);
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
    const result = await run<{ status: string; xp: number; coins: number; balance: number }>(
      `quest:${quest.id}`,
      { action: "quest", assignment: quest.id, season: season!.id },
      "The quest couldn’t be claimed.",
    );
    if (typeof result === "string") toast.error(result);
    else toast.success(`Quest complete: +${result.xp.toLocaleString("en")} Season XP and +${coinsText(result.coins)}`);
  }

  async function claimRewards() {
    const result = await run<{ claimed: number; items: number; coins: number; balance: number }>(
      "rewards",
      { action: "rewards", season: season!.id },
      "The rewards couldn’t be claimed.",
    );
    if (typeof result === "string") toast.error(result);
    else if (!result.claimed) toast.info("Everything you’ve reached is already claimed.");
    else
      toast.success(
        `${result.claimed} reward${result.claimed === 1 ? "" : "s"} claimed${result.items ? `: ${result.items} item${result.items === 1 ? "" : "s"} added to your Inventory` : ""}${result.coins ? `, +${coinsText(result.coins)}` : ""}`,
      );
  }

  async function buyPremium() {
    const result = await run<{ status: string; balance: number }>("premium", { action: "premium", season: season!.id, price: season!.premiumPrice }, "The purchase didn’t go through, and no coins were taken.");
    if (typeof result === "string") setDialog({ mode: "premium", error: result });
    else
      setDialog({
        mode: "done",
        title: "Premium unlocked",
        text:
          result.status === "owned"
            ? "You already had Premium for this season, so no coins were taken."
            : `${coinsText(season!.premiumPrice)} spent. Every Premium reward on tiers you’ve reached is ready to claim, and new ones unlock as you level up.`,
      });
  }

  async function skip(tiers: number, request: string) {
    const cost = tiers * season!.skipPrice;
    const result = await run<{ status: string; tiers: number; tier: number; balance: number }>(
      "skip",
      { action: "skip", request, season: season!.id, tiers, cost },
      "The purchase didn’t go through, and no coins were taken.",
    );
    if (typeof result === "string") setDialog({ mode: "skip", tiers, request, error: result });
    else
      setDialog({
        mode: "done",
        title: `Tier ${result.tier} reached`,
        text: `${result.status === "repeat" ? "This skip was already applied, so no coins were taken again." : `${coinsText(cost)} spent on ${tiers} tier${tiers === 1 ? "" : "s"}.`} Claim the new rewards from the track.`,
      });
  }

  const seasonStyle = { "--season": info.hue, "--season-glow": info.glow } as CSSProperties;

  return (
    <div className="grid gap-8" style={seasonStyle}>
      {state.otherSeasons.some((other) => other.claimable > 0) ? (
        <div role="status" className="enter flex flex-wrap items-center gap-3 rounded-xl border border-amethyst/40 bg-amethyst/[0.08] px-4 py-3 text-sm">
          <Gift aria-hidden className="size-4 text-amethyst" />
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

      <section
        aria-labelledby="season-title"
        className="enter relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-6"
        style={{ "--enter-index": 1, backgroundImage: "radial-gradient(120% 140% at 0% 0%, color-mix(in oklab, var(--season) 22%, transparent), transparent 60%)" } as CSSProperties}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {dateText(season.startsAt)} – {dateText(season.endsAt)} ·{" "}
              {season.active ? <TimeLeft to={season.endsAt} prefix="Ends in" /> : Date.parse(season.startsAt) > now ? "Not started yet" : "Season ended"}
            </p>
            <h2 id="season-title" className="mt-1 text-2xl font-semibold tracking-tight">
              {info.name}
            </h2>
            {info.tagline ? <p className="mt-1.5 max-w-prose text-sm leading-6 text-pretty text-muted-foreground">{info.tagline}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-foreground/[0.03] px-3 py-1 text-sm font-semibold tabular-nums">
              <Coins aria-hidden className="coin-ink size-4" />
              <span className="coin-ink" aria-live="polite">
                {balance.toLocaleString("en")}
              </span>
              <span className="font-normal text-muted-foreground">coins</span>
            </span>
            {progress.premium ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--season-glow)]/50 bg-[var(--season)]/15 px-3 py-1 text-sm font-semibold">
                <Crown aria-hidden className="size-4 text-[var(--season-glow)]" /> Premium
              </span>
            ) : season.active ? (
              <Button size="sm" onClick={() => setDialog({ mode: "premium" })} disabled={busy !== null}>
                <Crown aria-hidden /> Unlock Premium
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">
              Tier <span className="text-xl tabular-nums">{progress.tier}</span>
              <span className="text-muted-foreground"> / {season.tierCount}</span>
            </span>
            <span className="text-muted-foreground tabular-nums">
              {maxed ? "Every tier reached" : `${intoTier.toLocaleString("en")} / ${season.xpPerTier.toLocaleString("en")} XP to tier ${progress.tier + 1}`}
            </span>
          </div>
          <Bar value={intoTier} max={season.xpPerTier} label={maxed ? "Season complete" : `Season XP toward tier ${progress.tier + 1}`} className="h-3" />
          <p className="text-xs text-muted-foreground">
            {progress.xp.toLocaleString("en")} Season XP earned{progress.skipped ? ` · ${progress.skipped} tier${progress.skipped === 1 ? "" : "s"} skipped` : ""}. Complete quests to earn XP.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => void claimRewards()} disabled={busy !== null || claimable.length === 0} aria-busy={busy === "rewards"}>
            {busy === "rewards" ? <Loader2 aria-hidden className="animate-spin" /> : <Gift aria-hidden />}
            {claimable.length ? `Claim ${claimable.length} reward${claimable.length === 1 ? "" : "s"}` : "No rewards to claim"}
          </Button>
          {season.active && skipLeft > 0 ? (
            <Button variant="outline" onClick={() => setDialog({ mode: "skip", tiers: 1, request: crypto.randomUUID() })} disabled={busy !== null}>
              <ChevronsUp aria-hidden /> Skip tiers
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <a href="#quests">
              <ScrollText aria-hidden /> Quests{readyQuests ? ` · ${readyQuests} ready` : ""}
            </a>
          </Button>
        </div>
        {!season.active && Date.parse(season.endsAt) <= now ? (
          <p className="mt-4 text-sm text-muted-foreground">This season has ended. Premium and tier skips are closed, but everything you reached and every completed quest can still be claimed.</p>
        ) : null}
      </section>

      <section id="quests" aria-labelledby="quests-title" className="enter grid scroll-mt-24 gap-4" style={{ "--enter-index": 2 } as CSSProperties}>
        <div>
          <h2 id="quests-title" className="text-lg font-semibold">
            Quests
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Progress counts finished Arcade runs automatically. Completed quests stay claimable even after they reset.</p>
        </div>
        {earlier.length ? <QuestGroup title="Ready from earlier" note="Completed before the last reset" quests={earlier} busy={busy} onClaim={claimQuest} /> : null}
        {QUEST_CADENCES.map((cadence) => {
          const quests = current.filter((quest) => quest.cadence === cadence);
          const resets = quests[0]?.periodEnd;
          return (
            <QuestGroup
              key={cadence}
              title={CADENCE_LABELS[cadence].title}
              note={resets && cadence !== "season" ? <TimeLeft to={resets} prefix="New quests in" /> : CADENCE_LABELS[cadence].reset}
              quests={quests}
              busy={busy}
              onClaim={claimQuest}
              empty={season.active ? "No quests right now. Check back after the next reset." : "This season’s quests have closed."}
            />
          );
        })}
      </section>

      <section aria-labelledby="track-title" className="enter grid gap-4" style={{ "--enter-index": 3 } as CSSProperties}>
        <div>
          <h2 id="track-title" className="text-lg font-semibold">
            Reward track
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every tier has a free reward and a Premium reward. Rewards are cosmetic only. If you already own an item, you get half its value in coins instead.
          </p>
        </div>
        <ol className="grid gap-2">
          <li aria-hidden className="hidden grid-cols-[3.5rem_1fr_1fr] gap-2 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
            <span>Tier</span>
            <span>Free</span>
            <span className="flex items-center gap-1">
              <Crown className="size-3.5" /> Premium
            </span>
          </li>
          {Array.from({ length: season.tierCount }, (_, index) => index + 1).map((tier) => {
            const reached = tier <= progress.tier;
            const free = state.rewards.find((reward) => reward.tier === tier && reward.track === "free");
            const premium = state.rewards.find((reward) => reward.tier === tier && reward.track === "premium");
            return (
              <li
                key={tier}
                className={cn("grid grid-cols-[3rem_1fr_1fr] gap-2 rounded-xl border p-2 sm:grid-cols-[3.5rem_1fr_1fr]", reached ? "border-[var(--season)]/40 bg-[var(--season)]/[0.06]" : "border-border")}
              >
                <span className={cn("grid place-items-center rounded-lg text-lg font-semibold tabular-nums", reached ? "text-foreground" : "text-muted-foreground")}>
                  <span className="sr-only">Tier </span>
                  {tier}
                  {reached ? <span className="sr-only">, reached</span> : null}
                </span>
                <RewardCell reward={free} reached={reached} unlocked profile={profile} samples={samples} />
                <RewardCell reward={premium} reached={reached} unlocked={progress.premium} premium profile={profile} samples={samples} />
              </li>
            );
          })}
        </ol>
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
                    <Gift aria-hidden /> Claim {claimable.length} reward{claimable.length === 1 ? "" : "s"}
                  </Button>
                ) : null}
              </AlertDialogFooter>
            </>
          ) : dialog?.mode === "premium" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Unlock Premium for {info.name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Premium adds a second cosmetic reward to all {season.tierCount} tiers, including tiers you’ve already reached. Coins are taken once, and Premium lasts for this season.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Receipt rows={[["Premium Pass", season.premiumPrice]]} balance={balance} />
              {balance < season.premiumPrice ? (
                <p className="text-sm text-rose">You need {coinsText(season.premiumPrice - balance)} more. Complete quests and play Arcade games to earn coins.</p>
              ) : null}
              {dialog.error ? (
                <p role="alert" className="text-sm text-rose">
                  {dialog.error}
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy !== null}>Cancel</AlertDialogCancel>
                <Button onClick={() => void buyPremium()} disabled={busy !== null || balance < season.premiumPrice} aria-busy={busy === "premium"}>
                  {busy === "premium" ? <Loader2 aria-hidden className="animate-spin" /> : <Crown aria-hidden />}
                  {busy === "premium" ? "Unlocking…" : `Unlock for ${coinsText(season.premiumPrice)}`}
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
              onChange={(tiers) => setDialog({ mode: "skip", tiers, request: crypto.randomUUID() })}
              onConfirm={(tiers) => void skip(tiers, dialog.request)}
            />
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Receipt({ rows, balance }: { rows: [string, number][]; balance: number }) {
  const total = rows.reduce((sum, [, value]) => sum + value, 0);
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5 text-sm">
      {rows.map(([label, value]) => (
        <span key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{coinsText(value)}</dd>
        </span>
      ))}
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
        <AlertDialogTitle>Skip tiers</AlertDialogTitle>
        <AlertDialogDescription>
          Each tier costs {coinsText(price)} and unlocks that tier’s rewards right away. Your Season XP is kept. {left} tier{left === 1 ? "" : "s"} left this season.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label="One tier fewer" disabled={disabled || tiers <= 1} onClick={() => onChange(tiers - 1)}>
          <Minus aria-hidden />
        </Button>
        <output aria-live="polite" className="min-w-24 text-center text-sm font-semibold tabular-nums">
          {tiers} tier{tiers === 1 ? "" : "s"}
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
      <Receipt rows={[[`${tiers} × ${coinsText(price)}`, cost]]} balance={balance} />
      <p className="text-sm text-muted-foreground">
        Tier {tier} → <span className="font-semibold text-foreground">tier {tier + tiers}</span>
      </p>
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

function QuestGroup({
  title,
  note,
  quests,
  busy,
  onClaim,
  empty,
}: {
  title: string;
  note: ReactNode;
  quests: SeasonQuest[];
  busy: string | null;
  onClaim: (quest: SeasonQuest) => void;
  empty?: string;
}) {
  return (
    <div className="grid gap-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      {quests.length ? (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {quests.map((quest) => {
            const done = quest.progress >= quest.target;
            const name = questTitle(quest);
            return (
              <li key={quest.id} className={cn("grid gap-2 rounded-xl border p-3", quest.claimedAt ? "border-border opacity-70" : done ? "border-[var(--season)]/50 bg-[var(--season)]/[0.07]" : "border-border")}>
                <p className="text-sm font-medium text-pretty">{name}</p>
                <div className="flex items-center gap-2">
                  <Bar value={quest.progress} max={quest.target} label={`${name} progress`} className="flex-1" />
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {Math.min(quest.progress, quest.target).toLocaleString("en")}/{quest.target.toLocaleString("en")}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xs font-medium tabular-nums">
                    <span className="text-[var(--season-glow)]">+{quest.xp.toLocaleString("en")} XP</span>
                    <span className="coin-ink inline-flex items-center gap-1">
                      <Coins aria-hidden className="size-3.5" />+{quest.coins.toLocaleString("en")}
                    </span>
                  </span>
                  {quest.claimedAt ? (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Check aria-hidden className="size-3.5" /> Claimed
                    </span>
                  ) : done ? (
                    <Button size="sm" onClick={() => onClaim(quest)} disabled={busy !== null} aria-busy={busy === `quest:${quest.id}`} aria-label={`Claim: ${name}`}>
                      {busy === `quest:${quest.id}` ? <Loader2 aria-hidden className="animate-spin" /> : <Gift aria-hidden />}
                      Claim
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={questHref(quest)} aria-label={`Play for: ${name}`}>
                        <Play aria-hidden /> Play
                      </Link>
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function RewardCell({
  reward,
  reached,
  unlocked,
  premium = false,
  profile,
  samples,
}: {
  reward: SeasonReward | undefined;
  reached: boolean;
  unlocked: boolean;
  premium?: boolean;
  profile: ArtProfile;
  samples: ArtSamples;
}) {
  if (!reward) return <span className="rounded-lg border border-dashed border-border" />;
  const item = reward.item ? describeItem(reward.item) : null;
  const status = reward.claimed
    ? reward.duplicate
      ? `Claimed · already owned, +${coinsText(reward.paid)}`
      : "Claimed"
    : !reached
      ? "Locked"
      : !unlocked
        ? "Needs Premium"
        : "Ready to claim";
  const label = item ? item.name : coinsText(reward.coins);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 rounded-lg border p-2 text-center sm:flex-row sm:text-left",
        reward.claimed ? "border-border bg-foreground/[0.02]" : reached && unlocked ? "border-[var(--season)]/60 bg-[var(--season)]/[0.1]" : "border-border",
        premium && !unlocked && "bg-[var(--season)]/[0.03]",
      )}
    >
      <span className="sr-only">{premium ? "Premium reward:" : "Free reward:"}</span>
      <span className="grid h-16 w-full max-w-28 shrink-0 place-items-center overflow-hidden sm:w-28">
        {item ? (
          <span className="pointer-events-none origin-center scale-[0.8]">
            <ItemArt item={item} profile={profile} samples={samples} />
          </span>
        ) : (
          <span className="grid size-12 place-items-center rounded-full bg-foreground/[0.04]">
            <Coins aria-hidden className="coin-ink size-6" />
          </span>
        )}
      </span>
      <span className="grid min-w-0 gap-1">
        <span className={cn("truncate text-sm font-medium", item ? "" : "coin-ink")}>
          {premium ? <Crown aria-hidden className="mr-1 inline size-3.5 text-[var(--season-glow)] sm:hidden" /> : null}
          {label}
        </span>
        <span className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
          {item && reward.rarity ? <RarityTag rarity={reward.rarity} /> : null}
          {item ? <span className="text-xs text-muted-foreground">{inventoryItemLabel(item)}</span> : null}
        </span>
        <span className={cn("inline-flex items-center justify-center gap-1 text-xs sm:justify-start", reward.claimed ? "text-muted-foreground" : reached && unlocked ? "font-medium text-foreground" : "text-muted-foreground")}>
          {reward.claimed ? <Check aria-hidden className="size-3.5" /> : !reached || !unlocked ? <Lock aria-hidden className="size-3.5" /> : <Gift aria-hidden className="size-3.5" />}
          {status}
        </span>
      </span>
    </div>
  );
}

"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Coins, Eye, History, Loader2, Lock, Trophy } from "lucide-react";
import { toast } from "sonner";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { ArtworkFrame } from "@/components/media/artwork-frame";
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
import { ApiError, apiFetch } from "@/lib/api-client";
import { ARCADE_GAMES, DAILY_COIN_LIMIT, SUDOKU_DIFFICULTIES, SUDOKU_LABELS, formatDuration, type SudokuDifficulty } from "@/lib/arcade";
import { COSMETICS, COSMETIC_KIND_LABELS, type AvatarDecorationId, type CosmeticId, type CosmeticKind, type ShopItem } from "@/lib/cosmetics";
import type { CoinRule, ShopData } from "@/lib/data/shop";
import { ARTWORK_FRAMES, type ArtworkFrameId } from "@/lib/frames";
import { cn } from "@/lib/utils";
import { SampleArt, type FrameSample } from "../../settings/frame-settings";

type Profile = { name: string | null; avatarUrl: string | null };
type Samples = { portrait: FrameSample | null; square: FrameSample | null };
type Filter = "all" | CosmeticKind | "owned";
type Busy = { action: "buy" | "equip"; id: CosmeticId | null } | null;
type Purchase = { item: ShopItem; stage: "confirm" | "done"; already?: boolean; balanceAfter?: number; error?: string | null };

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "frame", label: "Frames" },
  { id: "avatar_decoration", label: "Avatar decorations" },
  { id: "owned", label: "Owned" },
];

const coinsText = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;

function purchaseError(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "insufficient_funds":
        return "You don’t have enough coins for this yet, so nothing was bought and no coins were taken.";
      case "price_changed":
        return "This item’s price just changed, so nothing was bought and no coins were taken. Check the new price and try again.";
      case "item_unavailable":
        return "This item isn’t available any more. No coins were taken.";
      default:
        return error.status >= 500 ? "The purchase didn’t go through, and no coins were taken. Try again in a moment." : error.message;
    }
  }
  return "The shop couldn’t be reached, so the purchase wasn’t confirmed. It’s safe to try again: the same item is never charged twice.";
}

function equipError(error: unknown) {
  if (error instanceof ApiError) return error.code === "cosmetic_not_owned" ? "You don’t own that item yet." : error.message;
  return "Couldn’t reach the server. Nothing was changed.";
}

function ItemPreview({ id, large, samples, profile }: { id: CosmeticId; large?: boolean; samples: Samples; profile: Profile }) {
  const info = COSMETICS[id];
  if (info.kind === "frame") {
    const frame = id as ArtworkFrameId;
    return (
      <span className={cn("flex items-end justify-center", large ? "gap-6" : "gap-3")}>
        <ArtworkFrame frame={frame} className={large ? "w-[6.5rem] sm:w-[7.5rem]" : "w-[4.25rem]"}>
          <SampleArt sample={samples.portrait} shape="portrait" />
        </ArtworkFrame>
        {large ? (
          <ArtworkFrame frame={frame} className="w-[8rem] sm:w-[9rem]">
            <SampleArt sample={samples.square} shape="square" />
          </ArtworkFrame>
        ) : null}
      </span>
    );
  }
  return (
    <span className={cn("flex items-center justify-center", large ? "gap-10" : "")}>
      <ProfileAvatar name={profile.name} src={profile.avatarUrl} decoration={id as AvatarDecorationId} className={large ? "size-24 text-2xl" : "size-14 text-base"} />
      {large ? <ProfileAvatar name={profile.name} src={profile.avatarUrl} decoration={id as AvatarDecorationId} className="size-9 text-xs" /> : null}
    </span>
  );
}

function Price({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", className)}>
      <Coins aria-hidden className="coin-ink size-3.5" />
      <span className="coin-ink">{value.toLocaleString("en")}</span>
      <span className="sr-only">coins</span>
    </span>
  );
}

function RuleLine({ rule }: { rule: CoinRule }) {
  if (rule.game === "sudoku") {
    const label = SUDOKU_LABELS[rule.variant as SudokuDifficulty] ?? rule.variant;
    return (
      <>
        <dt className="text-foreground">Sudoku · {label}</dt>
        <dd>
          <Price value={rule.flatCoins} /> per solved puzzle
          {rule.minSeconds > 0 ? <span className="text-muted-foreground"> (solved in {formatDuration(rule.minSeconds)} or more)</span> : null}
        </dd>
      </>
    );
  }
  const title = ARCADE_GAMES.find((game) => game.id === rule.game)?.title ?? rule.game;
  return (
    <>
      <dt className="text-foreground">{title}</dt>
      <dd>
        Score {rule.minScore.toLocaleString("en")}+ in a run of {rule.minSeconds}s or longer · more for higher scores, up to <Price value={rule.maxCoins} /> a run
      </dd>
    </>
  );
}

/** The shop: balance, a fitting room that previews without equipping, the catalogue, earning rules and coin history. */
export function ShopView({
  shop,
  frame,
  decoration,
  profile,
  samples,
}: {
  shop: ShopData;
  frame: ArtworkFrameId;
  decoration: AvatarDecorationId | null;
  profile: Profile;
  samples: Samples;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<CosmeticId | null>(shop.items[0]?.id ?? null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Synchronous guard so a double click can't send a second request before the first re-render.
  const inFlight = useRef(false);
  const fittingRoom = useRef<HTMLElement>(null);

  // What changed here since the server last rendered; cleared when fresh server data arrives.
  const [local, setLocal] = useState<{ balance?: number; owned: CosmeticId[]; frame?: ArtworkFrameId; decoration?: AvatarDecorationId | null }>({ owned: [] });
  const [seen, setSeen] = useState(shop);
  if (seen !== shop) {
    setSeen(shop);
    setLocal({ owned: [] });
  }

  const balance = local.balance ?? shop.balance;
  const equippedFrame = local.frame ?? frame;
  const equippedDecoration = local.decoration !== undefined ? local.decoration : decoration;
  const items = shop.items.map((item) => {
    const owned = item.owned || local.owned.includes(item.id);
    return { ...item, owned, equipped: owned && (item.kind === "frame" ? equippedFrame === item.id : equippedDecoration === item.id) };
  });
  const shown = items.filter((item) => (filter === "all" ? true : filter === "owned" ? item.owned : item.kind === filter));
  const counts: Record<Filter, number> = {
    all: items.length,
    frame: items.filter((item) => item.kind === "frame").length,
    avatar_decoration: items.filter((item) => item.kind === "avatar_decoration").length,
    owned: items.filter((item) => item.owned).length,
  };
  const focus = items.find((item) => item.id === selected) ?? items[0] ?? null;
  const scoreRules = ARCADE_GAMES.flatMap((game) => shop.rules.filter((rule) => rule.game === game.id && game.id !== "sudoku"));
  const sudokuRules = SUDOKU_DIFFICULTIES.flatMap((difficulty) => shop.rules.filter((rule) => rule.game === "sudoku" && rule.variant === difficulty));

  function preview(id: CosmeticId) {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) fittingRoom.current?.scrollIntoView({ block: "start" });
  }

  async function buy() {
    if (!purchase || purchase.stage !== "confirm" || inFlight.current) return;
    const { item } = purchase;
    inFlight.current = true;
    setBusy({ action: "buy", id: item.id });
    setPurchase({ ...purchase, error: null });
    try {
      const result = await apiFetch<{ status: "purchased" | "owned"; balance: number }>("/api/shop/purchase", {
        method: "POST",
        json: { item: item.id, price: item.price },
      });
      setLocal((current) => ({ ...current, balance: result.balance, owned: [...current.owned, item.id] }));
      setPurchase({ item, stage: "done", already: result.status === "owned", balanceAfter: result.balance });
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
      router.refresh();
    } catch (error) {
      setPurchase({ item, stage: "confirm", error: purchaseError(error) });
      if (error instanceof ApiError && error.status < 500) router.refresh();
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function equip(id: CosmeticId | null, kind: CosmeticKind) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy({ action: "equip", id });
    try {
      await apiFetch("/api/shop/equip", { method: "POST", json: { item: id } });
      setLocal((current) => (kind === "frame" ? { ...current, frame: id as ArtworkFrameId } : { ...current, decoration: id as AvatarDecorationId | null }));
      toast.success(id ? `${COSMETICS[id].name} equipped` : "Avatar decoration removed");
      setPurchase(null);
      router.refresh();
    } catch (error) {
      const message = equipError(error);
      if (purchase?.stage === "done") setPurchase({ ...purchase, error: message });
      else toast.error(message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function itemAction(item: (typeof items)[number], wide = false) {
    const name = COSMETICS[item.id].name;
    const working = busy !== null && (busy.id === item.id || (busy.id === null && item.equipped));
    if (item.equipped) {
      return (
        <div className={cn("flex flex-wrap items-center gap-2", wide && "justify-center")}>
          <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-amethyst">
            <Check aria-hidden className="size-4" />
            Equipped
          </span>
          {item.kind === "avatar_decoration" ? (
            <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void equip(null, item.kind)} aria-label={`Take off ${name}`}>
              {working ? <Loader2 aria-hidden className="animate-spin" /> : null}
              Take off
            </Button>
          ) : null}
        </div>
      );
    }
    if (item.owned) {
      return (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void equip(item.id, item.kind)} aria-label={`Equip ${name}`} className={cn(wide && "w-full sm:w-auto")}>
          {working ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
          Equip
        </Button>
      );
    }
    if (balance < item.price) {
      return (
        <Button size="sm" variant="outline" disabled aria-label={`${name}: you need ${coinsText(item.price - balance)} more`} className={cn(wide && "w-full sm:w-auto")}>
          <Lock aria-hidden />
          Need {(item.price - balance).toLocaleString("en")} more
        </Button>
      );
    }
    return (
      <Button size="sm" disabled={busy !== null} onClick={() => setPurchase({ item, stage: "confirm" })} aria-label={`Buy ${name} for ${coinsText(item.price)}`} className={cn(wide && "w-full sm:w-auto")}>
        <Coins aria-hidden />
        Buy
      </Button>
    );
  }

  const dialogItem = purchase ? COSMETICS[purchase.item.id] : null;
  const buying = busy?.action === "buy";
  const equippingFromDialog = busy?.action === "equip" && purchase !== null;

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
          <span className="block text-xs text-muted-foreground">
            {shop.earned > 0 ? `${coinsText(shop.earned)} earned from play so far.` : "Finish a good run in any Arcade game to earn your first coins."} Coins can’t be bought.
          </span>
        </span>
        <Link href="/arcade" className="arcade-counter-cta">
          <span className="hidden sm:inline">Earn more</span>
          <span className="sm:hidden">Play</span>
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(18rem,22rem)_1fr]">
        {focus ? (
          <section
            ref={fittingRoom}
            aria-labelledby="fitting-heading"
            className="enter scroll-mt-24 rounded-2xl border border-border bg-surface/50 p-4 lg:sticky lg:top-24"
            style={{ "--enter-index": 2 } as CSSProperties}
          >
            <h2 id="fitting-heading" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Eye aria-hidden className="size-4 text-amethyst" />
              Preview
            </h2>
            <div
              aria-hidden
              className="mt-3 flex min-h-56 items-center justify-center rounded-xl border border-border bg-[radial-gradient(20rem_12rem_at_50%_0%,rgb(var(--accent-rgb)/0.16),transparent_70%)] px-4 pt-10 pb-8"
            >
              <ItemPreview id={focus.id} large samples={samples} profile={profile} />
            </div>
            <div aria-live="polite" className="mt-4">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{COSMETIC_KIND_LABELS[focus.kind]}</p>
              <p className="mt-0.5 flex items-center justify-between gap-3 text-base font-semibold text-foreground">
                {COSMETICS[focus.id].name}
                {focus.owned ? null : <Price value={focus.price} />}
              </p>
              <p className="mt-1 text-sm text-pretty text-muted-foreground">{COSMETICS[focus.id].description}</p>
            </div>
            <div className="mt-4">{itemAction(focus, true)}</div>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              Previewing changes nothing. You’re using{" "}
              {focus.kind === "frame" ? (
                <>
                  the <span className="text-foreground">{ARTWORK_FRAMES[equippedFrame].name}</span> frame by default
                </>
              ) : equippedDecoration ? (
                <span className="text-foreground">{COSMETICS[equippedDecoration].name}</span>
              ) : (
                "no avatar decoration"
              )}
              .{" "}
              {focus.kind === "frame" ? (
                <>
                  Equipping a frame makes it your default; entries with their own frame keep it. Change it any time in{" "}
                  <Link href="/customization/frames" className="text-amethyst underline-offset-4 hover:underline">
                    Artwork frames
                  </Link>
                  .
                </>
              ) : (
                <>
                  Your picture itself never changes. Switch decorations any time in{" "}
                  <Link href="/customization/profile" className="text-amethyst underline-offset-4 hover:underline">
                    Profile
                  </Link>
                  .
                </>
              )}
            </p>
          </section>
        ) : null}

        <section aria-labelledby="catalogue-heading" className="min-w-0">
          <h2 id="catalogue-heading" className="sr-only">
            Items
          </h2>
          <div role="group" aria-label="Show" className="enter mb-4 flex flex-wrap gap-2" style={{ "--enter-index": 2 } as CSSProperties}>
            {FILTERS.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={filter === option.id}
                onClick={() => setFilter(option.id)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  filter === option.id ? "border-amethyst/60 bg-amethyst/[0.12] text-foreground" : "border-border text-muted-foreground hover:border-amethyst/40 hover:text-foreground",
                )}
              >
                {option.label}
                <span className="text-xs text-muted-foreground tabular-nums">{counts[option.id]}</span>
              </button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              {filter === "owned" ? "Nothing here yet. Items you buy stay yours for good and show up here." : "No items in this section right now."}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((item, index) => {
                const info = COSMETICS[item.id];
                const isFocus = focus?.id === item.id;
                return (
                  <li key={item.id} className="enter enter-card min-w-0" style={{ "--enter-index": index + 3 } as CSSProperties}>
                    <article
                      className={cn(
                        "flex h-full flex-col overflow-hidden rounded-xl border bg-surface/40 transition-[border-color,box-shadow] duration-200",
                        isFocus ? "border-amethyst/55 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.3)]" : "border-border hover:border-amethyst/35",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => preview(item.id)}
                        aria-pressed={isFocus}
                        aria-label={`Preview ${info.name}`}
                        className="group/preview relative flex h-40 items-center justify-center bg-[radial-gradient(16rem_9rem_at_50%_0%,rgb(var(--accent-rgb)/0.12),transparent_70%)] px-4 pt-6 pb-5 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <ItemPreview id={item.id} samples={samples} profile={profile} />
                        {item.owned ? (
                          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border">
                            <Check aria-hidden className="size-3 text-amethyst" />
                            {item.equipped ? "Equipped" : "Owned"}
                          </span>
                        ) : null}
                        <span
                          aria-hidden
                          className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground opacity-0 ring-1 ring-border transition-opacity group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100"
                        >
                          <Eye className="size-3" />
                          Preview
                        </span>
                      </button>
                      <div className="flex flex-1 flex-col gap-1 border-t border-border p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground">{info.name}</h3>
                          {item.owned ? null : <Price value={item.price} className="text-sm" />}
                        </div>
                        <p className="text-xs text-muted-foreground">{COSMETIC_KIND_LABELS[item.kind]}</p>
                        <p className="mt-1 text-xs leading-5 text-pretty text-muted-foreground">{info.description}</p>
                        <div className="mt-auto pt-3">{itemAction(item)}</div>
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="earn-heading" className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5">
          <h2 id="earn-heading" className="flex items-center gap-2 text-base font-semibold">
            <Trophy aria-hidden className="size-4 text-amethyst" />
            How to earn coins
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every finished run is counted once by the server, so replays and reloads never pay twice. Coins from play top out at {DAILY_COIN_LIMIT} in any 24 hours.
            Achievements stay as recognition and don’t pay coins.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(7rem,auto)_1fr] [&_dd]:mb-2 [&_dd]:text-muted-foreground sm:[&_dd]:mb-1">
            {scoreRules.map((rule) => (
              <RuleLine key={`${rule.game}:${rule.variant}`} rule={rule} />
            ))}
            {sudokuRules.map((rule) => (
              <RuleLine key={`${rule.game}:${rule.variant}`} rule={rule} />
            ))}
          </dl>
        </section>

        <section aria-labelledby="history-heading" className="rounded-2xl border border-border bg-surface/40 p-4 md:p-5">
          <h2 id="history-heading" className="flex items-center gap-2 text-base font-semibold">
            <History aria-hidden className="size-4 text-amethyst" />
            Recent coins
          </h2>
          {shop.history.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No coins yet. Finish a qualifying run in any Arcade game and it will show up here.</p>
          ) : (
            <ol className="mt-3 divide-y divide-border">
              {shop.history.map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{entry.label}</span>
                    <span suppressHydrationWarning className="block text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("block font-semibold tabular-nums", entry.amount > 0 ? "coin-ink" : "text-muted-foreground")}>
                      {entry.amount > 0 ? "+" : "−"}
                      {Math.abs(entry.amount).toLocaleString("en")}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">Balance {entry.balanceAfter.toLocaleString("en")}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <AlertDialog
        open={purchase !== null}
        onOpenChange={(open) => {
          if (!open && busy === null) setPurchase(null);
        }}
      >
        <AlertDialogContent>
          {purchase && dialogItem ? (
            purchase.stage === "confirm" ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Buy {dialogItem.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {COSMETIC_KIND_LABELS[dialogItem.kind]}. It’s yours for good once bought, and it doesn’t change anything until you equip it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div aria-hidden className="flex justify-center rounded-lg border border-border px-4 pt-6 pb-5">
                  <ItemPreview id={purchase.item.id} samples={samples} profile={profile} />
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 rounded-lg border border-border p-3 text-sm">
                  <dt className="text-muted-foreground">Price</dt>
                  <dd className="text-right">
                    <Price value={purchase.item.price} />
                  </dd>
                  <dt className="text-muted-foreground">Your balance</dt>
                  <dd className="text-right font-medium tabular-nums">{balance.toLocaleString("en")}</dd>
                  <dt className="border-t border-border pt-1.5 font-medium text-foreground">Balance after</dt>
                  <dd className="border-t border-border pt-1.5 text-right font-semibold tabular-nums">{Math.max(0, balance - purchase.item.price).toLocaleString("en")}</dd>
                </dl>
                {purchase.error ? (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {purchase.error}
                  </p>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={buying}>Cancel</AlertDialogCancel>
                  <Button onClick={() => void buy()} disabled={buying || balance < purchase.item.price} aria-busy={buying}>
                    {buying ? <Loader2 aria-hidden className="animate-spin" /> : <Coins aria-hidden />}
                    {buying ? "Buying…" : `Buy for ${coinsText(purchase.item.price)}`}
                  </Button>
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{purchase.already ? `You already own ${dialogItem.name}` : `${dialogItem.name} is yours`}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {purchase.already
                      ? "No coins were taken."
                      : `${coinsText(purchase.item.price)} spent. Your balance is now ${(purchase.balanceAfter ?? balance).toLocaleString("en")}.`}{" "}
                    {dialogItem.kind === "frame"
                      ? "Equip it now as your default artwork frame, or keep it for later in Artwork frames."
                      : "Wear it on your profile picture now, or keep it for later in Profile settings."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div aria-hidden className="flex justify-center rounded-lg border border-border px-4 pt-6 pb-5">
                  <ItemPreview id={purchase.item.id} samples={samples} profile={profile} />
                </div>
                {purchase.error ? (
                  <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {purchase.error}
                  </p>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={equippingFromDialog}>Keep for later</AlertDialogCancel>
                  <Button onClick={() => void equip(purchase.item.id, purchase.item.kind)} disabled={equippingFromDialog} aria-busy={equippingFromDialog}>
                    {equippingFromDialog ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
                    Equip now
                  </Button>
                </AlertDialogFooter>
              </>
            )
          ) : null}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

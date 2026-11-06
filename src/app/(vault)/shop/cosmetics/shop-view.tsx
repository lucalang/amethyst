"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Award, Check, Coins, Eye, LayoutGrid, Loader2, Lock, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { CatalogEmpty, CatalogSearch, OwnershipFilter } from "@/components/catalog/catalog-search";
import { TYPE_LOOK, toneStyle } from "@/components/inventory/item-art";
import "@/components/inventory/inventory.css";
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
import { achievementForItem } from "@/lib/achievements";
import { ApiError, apiFetch } from "@/lib/api-client";
import { catalogMatcher, ownershipMatches, type Ownership } from "@/lib/catalog-search";
import { COSMETICS, COSMETIC_KIND_LABELS, type AvatarDecorationId, type CosmeticId, type CosmeticKind, type ShopItem } from "@/lib/cosmetics";
import type { ShopData } from "@/lib/data/shop";
import { ARTWORK_FRAMES, type ArtworkFrameId } from "@/lib/frames";
import { DEFAULT_PROFILE_BANNER, PROFILE_BANNERS, PROFILE_FRAMES, type ProfileBannerId, type ProfileFrameId } from "@/lib/profile-cosmetics";
import { cn } from "@/lib/utils";
import { BannerSwatch, FrameSwatch } from "@/components/profile/profile-cosmetic-art";
import { SampleArt, type FrameSample } from "../../settings/frame-settings";

type Profile = { name: string | null; avatarUrl: string | null };
type Samples = { portrait: FrameSample | null; square: FrameSample | null };
type Filter = "all" | CosmeticKind | "achievement";
type Busy = { action: "buy" | "equip"; id: CosmeticId | null } | null;
type Purchase = { item: ShopItem; stage: "confirm" | "done"; already?: boolean; balanceAfter?: number; error?: string | null };

const FILTERS: { id: Filter; label: string; icon: LucideIcon; tone: string }[] = [
  { id: "all", label: "All", icon: LayoutGrid, tone: "var(--amethyst)" },
  { id: "frame", label: "Frames", ...TYPE_LOOK.frame },
  { id: "avatar_decoration", label: "Avatar decorations", ...TYPE_LOOK.avatar_decoration },
  { id: "profile_banner", label: "Banner themes", ...TYPE_LOOK.profile_banner },
  { id: "profile_frame", label: "Profile frames", ...TYPE_LOOK.profile_frame },
  { id: "achievement", label: "Achievements", icon: Award, tone: TYPE_LOOK.badge.tone },
];
/** Worn on the profile showcase rather than on artwork or the avatar. */
const isShowcaseKind = (kind: CosmeticKind) => kind === "profile_banner" || kind === "profile_frame";

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
  if (info.kind === "profile_banner" || info.kind === "profile_frame") {
    return (
      <span className={cn("block", large ? "w-60 max-w-full" : "w-40")}>
        {info.kind === "profile_banner" ? <BannerSwatch id={id as ProfileBannerId} /> : <FrameSwatch id={id as ProfileFrameId} className={large ? "[&_.pf-frame]:[--pf-corner:1.75rem]" : undefined} />}
      </span>
    );
  }
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

/** The shop: balance, a fitting room that previews without equipping, and the catalogue. */
export function ShopView({
  shop,
  frame,
  decoration,
  banner,
  profileFrame,
  profile,
  samples,
}: {
  shop: ShopData;
  frame: ArtworkFrameId;
  decoration: AvatarDecorationId | null;
  banner: ProfileBannerId;
  profileFrame: ProfileFrameId | null;
  profile: Profile;
  samples: Samples;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [selected, setSelected] = useState<CosmeticId | null>(shop.items[0]?.id ?? null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  // Synchronous guard so a double click can't send a second request before the first re-render.
  const inFlight = useRef(false);
  const fittingRoom = useRef<HTMLElement>(null);

  // What changed here since the server last rendered; cleared when fresh server data arrives.
  const [local, setLocal] = useState<{
    balance?: number;
    owned: CosmeticId[];
    frame?: ArtworkFrameId;
    decoration?: AvatarDecorationId | null;
    banner?: ProfileBannerId;
    profileFrame?: ProfileFrameId | null;
  }>({ owned: [] });
  const [seen, setSeen] = useState(shop);
  if (seen !== shop) {
    setSeen(shop);
    setLocal({ owned: [] });
  }

  const balance = local.balance ?? shop.balance;
  const equippedFrame = local.frame ?? frame;
  const equippedDecoration = local.decoration !== undefined ? local.decoration : decoration;
  const equippedBanner = local.banner ?? banner;
  const equippedProfileFrame = local.profileFrame !== undefined ? local.profileFrame : profileFrame;
  const worn: Record<CosmeticKind, string | null> = {
    frame: equippedFrame,
    avatar_decoration: equippedDecoration,
    profile_banner: equippedBanner,
    profile_frame: equippedProfileFrame,
  };
  const items = shop.items.map((item) => {
    const owned = item.owned || local.owned.includes(item.id);
    return { ...item, owned, equipped: owned && worn[item.kind] === item.id };
  });
  const match = catalogMatcher(query);
  const searched = items.filter((item) => {
    const ach = item.source === "achievement" ? achievementForItem(item.id) : undefined;
    const achTerm = ach?.name;
    return (
      ownershipMatches(ownership, item.owned) &&
      (!match || match(COSMETICS[item.id].name, COSMETICS[item.id].description, COSMETIC_KIND_LABELS[item.kind], item.source === "achievement" ? "achievement" : "shop", achTerm))
    );
  });
  const shown = searched.filter((item) => filter === "all" || (filter === "achievement" ? item.source === "achievement" : item.kind === filter));
  const counts: Record<Filter, number> = {
    all: searched.length,
    frame: searched.filter((item) => item.kind === "frame").length,
    avatar_decoration: searched.filter((item) => item.kind === "avatar_decoration").length,
    profile_banner: searched.filter((item) => item.kind === "profile_banner").length,
    profile_frame: searched.filter((item) => item.kind === "profile_frame").length,
    achievement: searched.filter((item) => item.source === "achievement").length,
  };
  const focus = items.find((item) => item.id === selected) ?? items[0] ?? null;

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
      await apiFetch("/api/shop/equip", { method: "POST", json: { item: id, slot: kind } });
      setLocal((current) => {
        if (kind === "frame") return { ...current, frame: id as ArtworkFrameId };
        if (kind === "profile_banner") return { ...current, banner: (id as ProfileBannerId | null) ?? DEFAULT_PROFILE_BANNER };
        if (kind === "profile_frame") return { ...current, profileFrame: id as ProfileFrameId | null };
        return { ...current, decoration: id as AvatarDecorationId | null };
      });
      toast.success(id ? `${COSMETICS[id].name} equipped` : `${COSMETIC_KIND_LABELS[kind]} removed`);
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
          <span className="inline-flex h-7 items-center gap-1.5 rounded-[min(var(--radius-md),12px)] border border-amethyst/35 bg-amethyst/[0.11] px-2.5 text-[0.8rem] font-medium text-amethyst select-none">
            <Check aria-hidden className="size-3.5" />
            Equipped
          </span>
          {item.kind !== "frame" ? (
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
    if (item.source === "achievement") {
      const ach = achievementForItem(item.id);
      const href = ach ? `/achievements#${ach.id}` : "/achievements";
      return (
        <Button asChild size="sm" variant="outline" className={cn(wide && "w-full sm:w-auto")}>
          <Link href={href}>
            <Award aria-hidden />
            {ach?.name ?? "View achievement"}
          </Link>
        </Button>
      );
    }
    if (balance < item.price) {
      return (
        <Button size="sm" variant="outline" disabled aria-label={`${name}: you need ${coinsText(item.price - balance)} more`} className={cn("border-dashed text-muted-foreground disabled:opacity-65", wide && "w-full sm:w-auto")}>
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
            data-glow
            className="ui-panel enter scroll-mt-24 p-4 lg:sticky lg:top-24"
            style={toneStyle(TYPE_LOOK[focus.kind].tone, 2)}
          >
            <h2 id="fitting-heading" className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <span aria-hidden className="ui-icon ui-icon-sm">
                <Eye className="size-4" />
              </span>
              Preview
            </h2>
            <div aria-hidden className="ui-stage mt-3 min-h-56 rounded-xl border border-border px-4 pt-10 pb-8">
              <ItemPreview id={focus.id} large samples={samples} profile={profile} />
            </div>
            <div aria-live="polite" className="mt-4">
              <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <span aria-hidden className="ui-dot" />
                {COSMETIC_KIND_LABELS[focus.kind]}
              </p>
              <p className="mt-0.5 flex items-center justify-between gap-3 text-base font-semibold text-foreground">
                {COSMETICS[focus.id].name}
                {focus.owned ? null : focus.source === "achievement" ? (
                  <span className="ui-pill" data-tone>
                    <Award aria-hidden className="size-3.5" />
                    Achievement
                  </span>
                ) : (
                  <Price value={focus.price} />
                )}
              </p>
            </div>
            <div className="mt-4">{itemAction(focus, true)}</div>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
              Previewing changes nothing. You’re using{" "}
              {focus.kind === "profile_banner" ? (
                <>
                  the <span className="text-foreground">{PROFILE_BANNERS[equippedBanner].name}</span> banner theme
                </>
              ) : focus.kind === "profile_frame" ? (
                equippedProfileFrame ? (
                  <>
                    the <span className="text-foreground">{PROFILE_FRAMES[equippedProfileFrame].name}</span> profile frame
                  </>
                ) : (
                  "no profile frame"
                )
              ) : focus.kind === "frame" ? (
                <>
                  the <span className="text-foreground">{ARTWORK_FRAMES[equippedFrame].name}</span> frame by default
                </>
              ) : equippedDecoration ? (
                <span className="text-foreground">{COSMETICS[equippedDecoration].name}</span>
              ) : (
                "no avatar decoration"
              )}
              .{" "}
              {isShowcaseKind(focus.kind) ? (
                <>
                  It’s shown only on your profile showcase and joins the look you’re wearing. Switch any time from{" "}
                  <Link href="/profile" className="text-amethyst underline-offset-4 hover:underline">
                    your profile
                  </Link>{" "}
                  with Arrange showcase.
                </>
              ) : focus.kind === "frame" ? (
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
          <div className="enter mb-4 grid gap-3" style={{ "--enter-index": 2 } as CSSProperties}>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <CatalogSearch value={query} onChange={setQuery} label="Search the shop" placeholder="Search frames, decorations and themes" className="sm:w-80" />
              <OwnershipFilter value={ownership} onChange={setOwnership} />
            </div>
            <div role="group" aria-label="Kind" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {FILTERS.map((option) => {
                const Icon = option.icon;
                const pressed = filter === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => setFilter(option.id)}
                    className={cn("inv-kind select-none", counts[option.id] === 0 && !pressed && "opacity-60")}
                    style={toneStyle(option.tone)}
                  >
                    <span aria-hidden className="inv-kind-icon">
                      <Icon className="size-[1.1rem]" />
                    </span>
                    <span className="min-w-0">
                      <span className="inv-kind-count">{counts[option.id]}</span>
                      <span className="inv-kind-label">{option.label}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {shown.length === 0 ? (
            ownership === "owned" && !match && !items.some((item) => item.owned) ? (
              <p className="ui-empty px-4 py-10 text-center text-sm text-muted-foreground">
                Nothing here yet. Items you buy stay yours for good and show up here.
              </p>
            ) : (
              <CatalogEmpty
                query={query}
                onReset={() => {
                  setQuery("");
                  setOwnership("all");
                  setFilter("all");
                }}
              />
            )
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((item, index) => {
                const info = COSMETICS[item.id];
                const isFocus = focus?.id === item.id;
                return (
                  <li key={item.id} className="enter enter-card min-w-0" style={{ "--enter-index": index + 3 } as CSSProperties}>
                    <article className="group/shop-card inv-tile" data-selected={isFocus} style={toneStyle(TYPE_LOOK[item.kind].tone)}>
                      <button
                        type="button"
                        onClick={() => preview(item.id)}
                        aria-pressed={isFocus}
                        aria-label={`Preview ${info.name}`}
                        className="group/preview inv-stage w-full outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                      >
                        <span className="inv-art">
                          <ItemPreview id={item.id} samples={samples} profile={profile} />
                        </span>
                        {item.owned ? (
                          <span className="idx-status absolute top-2.5 left-2.5" data-owned="true">
                            <Check aria-hidden className="size-3" />
                            {item.equipped ? "Equipped" : "Owned"}
                          </span>
                        ) : null}
                        <span
                          aria-hidden
                          data-tone={isFocus ? "" : undefined}
                          className={cn(
                            "ui-pill absolute top-2.5 right-2.5 transition-opacity duration-150",
                            isFocus ? "opacity-100" : "opacity-0 group-hover/preview:opacity-100 group-focus-visible/preview:opacity-100",
                          )}
                        >
                          <Eye className="size-3" />
                          {isFocus ? "In preview" : "Preview"}
                        </span>
                      </button>
                      <div className="flex flex-1 flex-col gap-1 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="text-sm font-semibold text-foreground transition-colors group-hover/shop-card:text-(--tone)">{info.name}</h3>
                          {item.owned ? null : item.source === "achievement" ? (
                            <span className="ui-pill shrink-0" data-tone>
                              <Award aria-hidden className="size-3" />
                              Achievement
                            </span>
                          ) : (
                            <Price value={item.price} className="text-sm" />
                          )}
                        </div>
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span aria-hidden className="inv-dot" />
                          {COSMETIC_KIND_LABELS[item.kind]}
                        </p>
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
                <div aria-hidden className="ui-stage rounded-xl border border-border px-4 pt-6 pb-5" style={toneStyle(TYPE_LOOK[dialogItem.kind].tone)}>
                  <ItemPreview id={purchase.item.id} samples={samples} profile={profile} />
                </div>
                <dl className="ui-panel grid grid-cols-[1fr_auto] gap-y-1.5 p-3 text-sm">
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
                    {isShowcaseKind(dialogItem.kind)
                      ? "Wear it on your profile showcase now, or keep it for later and choose it when you edit your showcase."
                      : dialogItem.kind === "frame"
                      ? "Equip it now as your default artwork frame, or keep it for later in Artwork frames."
                      : "Wear it on your profile picture now, or keep it for later in Profile settings."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div aria-hidden className="ui-stage rounded-xl border border-border px-4 pt-6 pb-5" style={toneStyle(TYPE_LOOK[dialogItem.kind].tone)}>
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

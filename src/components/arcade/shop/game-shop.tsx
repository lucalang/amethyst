"use client";

import { useRef, useState, type ComponentType } from "react";
import {
  Apple,
  Bird,
  BookOpen,
  Brush,
  Building2,
  Check,
  Columns3,
  Coins,
  Droplets,
  Eye,
  Grid3x3,
  Highlighter,
  Image as ImageIcon,
  Loader2,
  Lock,
  Map as MapIcon,
  Mountain,
  Palette,
  RotateCcw,
  Sparkles,
  Sword,
  Type,
  Wind,
} from "lucide-react";
import { toast } from "sonner";
import { CatalogEmpty, CatalogSearch, OwnershipFilter } from "@/components/catalog/catalog-search";
import { useMotionLevel } from "@/components/showcase/motion";
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
import { catalogMatcher, ownershipMatches, type Ownership } from "@/lib/catalog-search";
import type { GameShopData } from "@/lib/data/shop";
import { GAME_SHOPS, type CategoryIcon, type GameCategory, type GameLook } from "@/lib/game-cosmetics";
import { cn } from "@/lib/utils";
import { CosmeticPreview } from "./preview";

const ICONS: Record<CategoryIcon, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  palette: Palette,
  map: MapIcon,
  sparkles: Sparkles,
  brush: Brush,
  grid: Grid3x3,
  type: Type,
  bird: Bird,
  wind: Wind,
  columns: Columns3,
  mountain: Mountain,
  book: BookOpen,
  highlighter: Highlighter,
  sword: Sword,
  apple: Apple,
  image: ImageIcon,
  droplets: Droplets,
  building: Building2,
};

type Entry = { slug: string | null; id: string | null; name: string; description: string; price: number; available: boolean; owned: boolean; equipped: boolean };
type Purchase = { entry: Entry; category: GameCategory; stage: "confirm" | "done"; already?: boolean; error?: string | null };

const coinsText = (value: number) => `${value.toLocaleString("en")} coin${value === 1 ? "" : "s"}`;

function purchaseError(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "insufficient_funds":
        return "You don’t have enough coins for this yet, so nothing was bought and no coins were taken.";
      case "price_changed":
        return "This item’s price just changed, so nothing was bought and no coins were taken. Reopen the shop to see the new price.";
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

function Price({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 font-semibold tabular-nums", className)}>
      <Coins aria-hidden className="coin-ink size-3.5" />
      <span className="coin-ink">{value.toLocaleString("en")}</span>
      <span className="sr-only">coins</span>
    </span>
  );
}

function StateBadge({ entry }: { entry: Entry }) {
  if (entry.equipped)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amethyst/15 px-2 py-0.5 text-[11px] font-semibold text-amethyst ring-1 ring-amethyst/40">
        <Check aria-hidden className="size-3" />
        Equipped
      </span>
    );
  if (entry.owned)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground ring-1 ring-border">
        <Check aria-hidden className="size-3 text-muted-foreground" />
        {entry.slug ? "Owned" : "Free"}
      </span>
    );
  if (!entry.available) return <span className="rounded-full px-2 py-0.5 text-[11px] text-muted-foreground ring-1 ring-border">Unavailable</span>;
  return <Price value={entry.price} className="text-sm" />;
}

/**
 * One game's shop: balance, categories, a live preview that never equips, and buy / equip / restore.
 * Purchases go through the shared atomic purchase endpoint; equipping is a separate, free call.
 */
export function GameShop({ data, onLook, compact = false }: { data: GameShopData; onLook?: (look: GameLook) => void; compact?: boolean }) {
  const shop = GAME_SHOPS[data.game];
  const effects = useMotionLevel();
  const [categoryId, setCategoryId] = useState(shop.categories[0].id);
  // Preview choices per category (null = the free default); they change nothing until equipped.
  const [trying, setTrying] = useState<Record<string, string | null>>({});
  const [balance, setBalance] = useState(data.balance);
  const [bought, setBought] = useState<string[]>([]);
  const [look, setLook] = useState<GameLook>(data.look);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const inFlight = useRef(false);
  const previewRef = useRef<HTMLElement>(null);

  const states = new Map(data.items.map((item) => [item.id, item]));
  const category = shop.categories.find((entry) => entry.id === categoryId) ?? shop.categories[0];

  function entriesOf(cat: GameCategory): Entry[] {
    const equipped = look[cat.id] ?? null;
    return [
      { slug: null, id: null, ...cat.default, price: 0, available: true, owned: true, equipped: equipped === null },
      ...cat.items.map((item) => {
        const id = `${shop.prefix}-${item.slug}`;
        const state = states.get(id);
        return {
          slug: item.slug,
          id,
          name: item.name,
          description: item.description,
          price: state?.price ?? item.price,
          available: state?.available ?? false,
          owned: Boolean(state?.owned) || bought.includes(id),
          equipped: equipped === item.slug,
        };
      }),
    ];
  }

  const entries = entriesOf(category);
  const match = catalogMatcher(query);
  const filtering = match !== null || ownership !== "all";
  const visibleIn = (cat: GameCategory) =>
    entriesOf(cat).filter((entry) => ownershipMatches(ownership, entry.owned) && (!match || match(entry.name, entry.description, cat.label, entry.slug ? null : "default free")));
  const shown = filtering ? visibleIn(category) : entries;
  const elsewhere = filtering && !shown.length ? shop.categories.flatMap((cat) => (cat.id === category.id ? [] : [{ cat, count: visibleIn(cat).length }])).filter((hit) => hit.count) : [];
  const focusSlug = categoryId in trying ? trying[categoryId] : (look[categoryId] ?? null);
  const focus = entries.find((entry) => entry.slug === focusSlug) ?? entries[0];
  const previewLook: GameLook = { ...look };
  for (const [cat, slug] of Object.entries(trying)) {
    if (slug === null) delete previewLook[cat];
    else previewLook[cat] = slug;
  }
  const tryingOn = Object.entries(trying).filter(([cat, slug]) => (look[cat] ?? null) !== slug);

  function preview(entry: Entry) {
    setTrying((current) => ({ ...current, [categoryId]: entry.slug }));
    if (window.matchMedia("(max-width: 1023px)").matches) previewRef.current?.scrollIntoView({ block: "nearest", behavior: effects === "off" ? "auto" : "smooth" });
  }

  async function buy() {
    if (!purchase || purchase.stage !== "confirm" || inFlight.current) return;
    const { entry } = purchase;
    if (!entry.id) return;
    inFlight.current = true;
    setBusy(entry.id);
    setPurchase({ ...purchase, error: null });
    try {
      const result = await apiFetch<{ status: "purchased" | "owned"; balance: number }>("/api/shop/purchase", {
        method: "POST",
        json: { item: entry.id, price: entry.price },
      });
      setBalance(result.balance);
      setBought((current) => [...current, entry.id as string]);
      setPurchase({ ...purchase, stage: "done", already: result.status === "owned" });
      window.dispatchEvent(new CustomEvent("archive:coins", { detail: result.balance }));
    } catch (error) {
      setPurchase({ ...purchase, error: purchaseError(error) });
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  async function equip(cat: GameCategory, entry: Entry) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(entry.id ?? `default:${cat.id}`);
    try {
      await apiFetch("/api/shop/game", { method: "POST", json: { game: data.game, category: cat.id, item: entry.id } });
      const next = { ...look };
      if (entry.slug) next[cat.id] = entry.slug;
      else delete next[cat.id];
      setLook(next);
      setTrying((current) => {
        const rest = { ...current };
        delete rest[cat.id];
        return rest;
      });
      onLook?.(next);
      toast.success(entry.slug ? `${entry.name} equipped` : `${cat.label}: default restored`);
      setPurchase(null);
    } catch (error) {
      const message = equipError(error);
      if (purchase?.stage === "done") setPurchase({ ...purchase, error: message });
      else toast.error(message);
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function action(entry: Entry, wide = false) {
    const working = busy !== null && busy === (entry.id ?? `default:${category.id}`);
    if (entry.equipped) {
      return (
        <span className={cn("inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-amethyst", wide && "justify-center")}>
          <Check aria-hidden className="size-4" />
          Equipped
        </span>
      );
    }
    if (entry.owned) {
      return (
        <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => void equip(category, entry)} aria-label={entry.slug ? `Equip ${entry.name}` : `Restore the default ${category.label.toLowerCase()}`} className={cn(wide && "w-full sm:w-auto")}>
          {working ? <Loader2 aria-hidden className="animate-spin" /> : entry.slug ? <Check aria-hidden /> : <RotateCcw aria-hidden />}
          {entry.slug ? "Equip" : "Use default"}
        </Button>
      );
    }
    if (!entry.available) {
      return (
        <Button size="sm" variant="outline" disabled className={cn(wide && "w-full sm:w-auto")}>
          Not available
        </Button>
      );
    }
    if (balance < entry.price) {
      return (
        <Button size="sm" variant="outline" disabled aria-label={`${entry.name}: you need ${coinsText(entry.price - balance)} more`} className={cn(wide && "w-full sm:w-auto")}>
          <Lock aria-hidden />
          Need {(entry.price - balance).toLocaleString("en")} more
        </Button>
      );
    }
    return (
      <Button size="sm" disabled={busy !== null} onClick={() => setPurchase({ entry, category, stage: "confirm" })} aria-label={`Buy ${entry.name} for ${coinsText(entry.price)}`} className={cn(wide && "w-full sm:w-auto")}>
        <Coins aria-hidden />
        Buy
      </Button>
    );
  }

  const Icon = ICONS[category.icon];
  const buying = purchase !== null && busy === purchase.entry.id && purchase.stage === "confirm";

  return (
    <div className="grid gap-5">
      <section aria-label="Coin balance" className={cn("arcade-counter", compact && "py-2")}>
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
          <span className="block text-xs text-muted-foreground">Earned by playing. Purchases are permanent unlocks; equipping and restoring defaults are free.</span>
        </span>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <CatalogSearch value={query} onChange={setQuery} label={`Search the ${shop.title} shop`} placeholder={`Search ${shop.title} items`} />
        <OwnershipFilter value={ownership} onChange={setOwnership} />
      </div>

      <div role="group" aria-label={`${shop.title} cosmetic categories`} className="-mt-2 flex flex-wrap gap-2">
        {shop.categories.map((cat) => {
          const CatIcon = ICONS[cat.icon];
          const owned = entriesOf(cat).filter((entry) => entry.slug && entry.owned).length;
          const hits = filtering ? visibleIn(cat).length : null;
          const selected = cat.id === category.id;
          return (
            <button
              key={cat.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setCategoryId(cat.id)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "border-amethyst/60 bg-amethyst/[0.12] text-foreground" : "border-border text-muted-foreground hover:border-amethyst/40 hover:text-foreground",
                hits === 0 && !selected && "opacity-60",
              )}
            >
              <CatIcon aria-hidden className="size-4" />
              {cat.label}
              {hits !== null ? (
                <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${hits} ${hits === 1 ? "match" : "matches"}`}>
                  {hits}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground tabular-nums" aria-label={`${owned} of ${cat.items.length} owned`}>
                  {owned}/{cat.items.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={cn("grid items-start gap-5", compact ? "md:grid-cols-[minmax(16rem,22rem)_1fr]" : "lg:grid-cols-[minmax(18rem,26rem)_1fr]")}>
        <section
          ref={previewRef}
          aria-labelledby="game-preview-heading"
          className={cn("scroll-mt-24 rounded-2xl border border-border bg-surface/50 p-4", compact ? "md:sticky md:top-0" : "lg:sticky lg:top-24")}
        >
          <h2 id="game-preview-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <Eye aria-hidden className="size-4 text-amethyst" />
            Preview
            {tryingOn.length ? (
              <button type="button" onClick={() => setTrying({})} className="ml-auto text-xs font-medium text-amethyst underline-offset-4 hover:underline">
                Show what I have equipped
              </button>
            ) : null}
          </h2>
          <CosmeticPreview game={data.game} look={previewLook} focus={category.id} effects={effects} />
          <div aria-live="polite" className="mt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{category.label}</p>
            <p className="mt-0.5 flex items-center justify-between gap-3 text-base font-semibold text-foreground">
              {focus.name}
              {focus.owned ? null : <Price value={focus.price} />}
            </p>
            <p className="mt-1 text-sm text-pretty text-muted-foreground">{focus.description}</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">{action(focus, true)}</div>
          <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            Previewing is free and changes nothing. {tryingOn.length > 1 ? "The preview combines everything you’re trying on. " : ""}Cosmetics never change hitboxes, timing,
            scoring or rewards.
          </p>
        </section>

        <section aria-labelledby="game-items-heading" className="min-w-0">
          <h2 id="game-items-heading" className="flex items-center gap-2 text-base font-semibold">
            <Icon aria-hidden className="size-4 text-amethyst" />
            {category.label}
          </h2>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{category.blurb}</p>
          {shown.length === 0 ? (
            <div className="mt-4">
              <CatalogEmpty
                query={query}
                onReset={() => {
                  setQuery("");
                  setOwnership("all");
                }}
              >
                {elsewhere.length ? (
                  <p className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <span>Found in</span>
                    {elsewhere.map(({ cat, count }) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryId(cat.id)}
                        className="rounded-full border border-border px-2.5 py-0.5 text-foreground outline-none hover:border-amethyst/45 focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {cat.label} <span className="text-muted-foreground tabular-nums">{count}</span>
                      </button>
                    ))}
                  </p>
                ) : null}
              </CatalogEmpty>
            </div>
          ) : null}
          <ul className={cn("mt-4 grid grid-cols-1 gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
            {shown.map((entry) => {
              const isFocus = entry.slug === focus.slug;
              return (
                <li key={entry.slug ?? "default"} className="min-w-0">
                  <article
                    className={cn(
                      "flex h-full flex-col rounded-xl border bg-surface/40 transition-[border-color,box-shadow] duration-200",
                      isFocus ? "border-amethyst/55 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.3)]" : "border-border hover:border-amethyst/35",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => preview(entry)}
                      aria-pressed={isFocus}
                      aria-label={`Preview ${entry.name}`}
                      className="flex flex-1 flex-col gap-1 rounded-t-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-foreground">{entry.name}</span>
                        <StateBadge entry={entry} />
                      </span>
                      {entry.slug ? null : <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Default · free</span>}
                      <span className="text-xs leading-5 text-pretty text-muted-foreground">{entry.description}</span>
                    </button>
                    <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 text-xs", isFocus ? "font-medium text-amethyst" : "text-muted-foreground")}>
                        <Eye aria-hidden className="size-3" />
                        {isFocus ? "In preview" : "Preview"}
                      </span>
                      {action(entry)}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <AlertDialog
        open={purchase !== null}
        onOpenChange={(open) => {
          if (!open && !buying) setPurchase(null);
        }}
      >
        {purchase ? (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{purchase.stage === "done" ? (purchase.already ? "Already yours" : `${purchase.entry.name} is yours`) : `Buy ${purchase.entry.name}?`}</AlertDialogTitle>
              <AlertDialogDescription>
                {purchase.stage === "done" ? (
                  <>
                    {purchase.already ? "You already owned this, so no coins were taken." : `Paid ${coinsText(purchase.entry.price)}. You have ${coinsText(balance)} left.`} Equip it now or any time
                    later from this shop.
                  </>
                ) : (
                  <>
                    {shop.title} · {purchase.category.label}. This costs <Price value={purchase.entry.price} className="text-foreground" />, leaving you{" "}
                    {coinsText(Math.max(0, balance - purchase.entry.price))}. It’s a permanent unlock: equipping it or switching back is always free.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            {purchase.error ? (
              <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {purchase.error}
              </p>
            ) : null}
            <AlertDialogFooter>
              {purchase.stage === "done" ? (
                <>
                  <AlertDialogCancel disabled={busy !== null}>Not now</AlertDialogCancel>
                  <Button disabled={busy !== null} onClick={() => void equip(purchase.category, { ...purchase.entry, owned: true })}>
                    {busy !== null ? <Loader2 aria-hidden className="animate-spin" /> : <Check aria-hidden />}
                    Equip now
                  </Button>
                </>
              ) : (
                <>
                  <AlertDialogCancel disabled={buying}>Cancel</AlertDialogCancel>
                  <Button disabled={buying} onClick={() => void buy()}>
                    {buying ? <Loader2 aria-hidden className="animate-spin" /> : <Coins aria-hidden />}
                    Buy for {purchase.entry.price.toLocaleString("en")}
                  </Button>
                </>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </div>
  );
}

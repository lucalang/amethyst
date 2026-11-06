"use client";

import "./inventory.css";
import { useRef, useState, useTransition, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Backpack, Loader2, RotateCcw, TriangleAlert, type LucideIcon } from "lucide-react";
import { CatalogEmpty, CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { RarityTag } from "@/components/lootboxes/parts";
import { useMotionLevel } from "@/components/showcase/motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogMatcher } from "@/lib/catalog-search";
import { GAME_SHOPS, SHOP_GAMES, shopHref, type ShopGame } from "@/lib/game-cosmetics";
import { INVENTORY_TYPES, INVENTORY_TYPE_LABELS, inventoryItemLabel, type CollectibleItem, type InventoryItem, type InventoryType } from "@/lib/inventory";
import { cn } from "@/lib/utils";
import { ItemArt, TYPE_LOOK, toneOf, toneStyle, type ArtProfile as Profile, type ArtSamples as Samples } from "./item-art";

const CosmeticPreview = dynamic(() => import("@/components/arcade/shop/preview").then((mod) => mod.CosmeticPreview), {
  ssr: false,
  loading: () => <Skeleton className="mx-auto aspect-[4/3] w-full max-w-[26rem] rounded-xl" />,
});

type Sort = "recent" | "name" | "type";

const SORTS: { id: Sort; label: string }[] = [
  { id: "recent", label: "Newest" },
  { id: "name", label: "A–Z" },
  { id: "type", label: "Type" },
];

/** Where an item is put to use; the Inventory itself never equips anything. */
export function placeFor(item: CollectibleItem): { href: string; label: string } {
  switch (item.type) {
    case "frame":
      return { href: "/customization/frames", label: "Set your default frame" };
    case "avatar_decoration":
      return { href: "/customization/profile", label: "Change your avatar decoration" };
    case "game":
      return { href: shopHref(item.game), label: `Equip in the ${GAME_SHOPS[item.game].title} shop` };
    default:
      return { href: "/profile", label: "Arrange your profile showcase" };
  }
}

function KindButton({ icon: Icon, tone, label, count, pressed, onClick }: { icon: LucideIcon; tone: string; label: string; count: number; pressed: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className="inv-kind" style={toneStyle(tone)}>
      <span className="inv-kind-icon">
        <Icon aria-hidden className="size-[1.1rem]" />
      </span>
      <span className="min-w-0">
        <span className="inv-kind-count">{count}</span>
        <span className="inv-kind-label">{label}</span>
      </span>
    </button>
  );
}

/** Every item the account owns, with type and game filters, search and a large preview. View only. */
export function InventoryView({ items, profile, samples }: { items: InventoryItem[] | null; profile: Profile; samples: Samples }) {
  const router = useRouter();
  const effects = useMotionLevel();
  const [retrying, startRetry] = useTransition();
  const [type, setType] = useState<"all" | InventoryType>("all");
  const [game, setGame] = useState<"all" | ShopGame>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [selected, setSelected] = useState<string | null>(null);
  const inspector = useRef<HTMLElement>(null);

  if (!items) {
    return (
      <div role="alert" className="enter mx-auto max-w-md rounded-2xl border border-rose/40 bg-card px-6 py-10 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose/40 bg-rose/10 text-rose">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">Your inventory couldn’t be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">Everything you own is safe. Try again in a moment.</p>
        <Button className="mt-5" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
          {retrying ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="enter relative overflow-hidden rounded-2xl border border-border bg-[radial-gradient(28rem_14rem_at_50%_0%,rgb(var(--accent-rgb)/0.14),transparent_70%)] px-6 py-14 text-center">
        <div aria-hidden className="mx-auto flex w-max items-end justify-center">
          {(["frame", "badge", "game"] as const).map((id, index) => {
            const Icon = TYPE_LOOK[id].icon;
            return (
              <span
                key={id}
                style={toneStyle(TYPE_LOOK[id].tone)}
                className={cn(
                  "grid size-16 place-items-center rounded-2xl border border-dashed border-[color-mix(in_oklab,var(--tone)_55%,transparent)] bg-card text-(--tone) shadow-[0_16px_30px_-22px_var(--tone)]",
                  index === 0 && "translate-x-2 -rotate-12",
                  index === 1 && "z-10 size-20 -translate-y-2",
                  index === 2 && "-translate-x-2 rotate-12",
                )}
              >
                <Icon className="size-6" />
              </span>
            );
          })}
        </div>
        <h2 className="mt-6 text-lg font-semibold">Nothing here yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          Frames, avatar decorations, banners, badges, titles and game cosmetics you buy, earn or unlock will be collected here.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/shop">Visit the Shop</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/achievements">See achievements</Link>
          </Button>
        </div>
      </div>
    );
  }

  const match = catalogMatcher(query);
  const searched = match ? items.filter((item) => match(item.name, item.description, inventoryItemLabel(item), INVENTORY_TYPE_LABELS[item.type].one)) : items;
  const types = INVENTORY_TYPES.filter((id) => items.some((item) => item.type === id));
  const games = SHOP_GAMES.filter((id) => items.some((item) => item.type === "game" && item.game === id));
  const ofType = searched.filter((item) => type === "all" || item.type === type);
  const shown = ofType.filter((item) => type !== "game" || game === "all" || (item.type === "game" && item.game === game));
  if (sort === "name") shown.sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (sort === "type") {
    const rank = (item: InventoryItem) => INVENTORY_TYPES.indexOf(item.type) * 100 + (item.type === "game" ? SHOP_GAMES.indexOf(item.game) : 0);
    shown.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "en"));
  }
  const focus = shown.find((item) => item.id === selected) ?? shown[0] ?? null;

  const chooseType = (next: "all" | InventoryType) => {
    setType(next);
    setGame("all");
  };
  const reset = () => {
    setQuery("");
    chooseType("all");
  };
  const choose = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 1023px)").matches) inspector.current?.scrollIntoView({ block: "start" });
  };

  const place = focus ? placeFor(focus) : null;

  return (
    <div className="grid gap-5">
      <div role="group" aria-label="Item type" className="enter grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]" style={{ "--enter-index": 1 } as CSSProperties}>
        <KindButton icon={Backpack} tone="var(--amethyst)" label="All items" count={searched.length} pressed={type === "all"} onClick={() => chooseType("all")} />
        {types.map((id) => (
          <KindButton
            key={id}
            icon={TYPE_LOOK[id].icon}
            tone={TYPE_LOOK[id].tone}
            label={INVENTORY_TYPE_LABELS[id].many}
            count={searched.filter((item) => item.type === id).length}
            pressed={type === id}
            onClick={() => chooseType(id)}
          />
        ))}
      </div>

      <div className="enter flex flex-wrap items-center gap-3" style={{ "--enter-index": 2 } as CSSProperties}>
        <CatalogSearch value={query} onChange={setQuery} label="Search your inventory" placeholder="Search your items" className="sm:w-72" />
        <div role="group" aria-label="Sort" className="flex items-center gap-2 sm:ml-auto">
          <span aria-hidden className="text-xs font-medium text-muted-foreground">
            Sort
          </span>
          {SORTS.map((option) => (
            <FilterChip key={option.id} pressed={sort === option.id} onClick={() => setSort(option.id)}>
              <span className="sr-only">Sort by </span>
              {option.label}
            </FilterChip>
          ))}
        </div>
      </div>

      {type === "game" && games.length > 1 ? (
        <div role="group" aria-label="Game" className="flex flex-wrap gap-2">
          <FilterChip pressed={game === "all"} onClick={() => setGame("all")} count={ofType.length}>
            All games
          </FilterChip>
          {games.map((id) => (
            <FilterChip key={id} pressed={game === id} onClick={() => setGame(id)} count={ofType.filter((item) => item.type === "game" && item.game === id).length}>
              {GAME_SHOPS[id].title}
            </FilterChip>
          ))}
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]">
        {focus && place ? (
          <aside
            id="inv-inspector"
            ref={inspector}
            aria-labelledby="inv-focus-name"
            className="inv-inspect enter scroll-mt-24 rounded-2xl border border-border bg-surface/50 p-4 lg:sticky lg:top-24"
            style={toneStyle(toneOf(focus), 3)}
          >
            <div className="inv-stage" data-type={focus.type} aria-hidden={focus.type === "game" ? undefined : true}>
              {focus.type === "game" ? (
                <CosmeticPreview game={focus.game} look={{ [focus.category]: focus.slug }} focus={focus.category} effects={effects} />
              ) : (
                <ItemArt item={focus} profile={profile} samples={samples} large />
              )}
            </div>
            <div aria-live="polite" className="mt-4">
              <p className="flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                <span aria-hidden className="inv-dot" />
                {inventoryItemLabel(focus)}
              </p>
              <h2 id="inv-focus-name" className="mt-1 text-xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]">
                {focus.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{focus.description}</p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                <dt className="text-muted-foreground">Rarity</dt>
                <dd className="mt-0.5 font-medium text-foreground">
                  <RarityTag rarity={focus.rarity} />
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                <dt className="text-muted-foreground">Acquired</dt>
                <dd suppressHydrationWarning className="mt-0.5 font-medium text-foreground">
                  {new Date(focus.acquiredAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </dd>
              </div>
            </dl>
            <Button asChild variant="outline" size="sm" className="mt-4 w-full">
              <Link href={place.href}>
                {place.label}
                <ArrowUpRight aria-hidden />
              </Link>
            </Button>
          </aside>
        ) : null}

        <section aria-labelledby="inv-items-heading" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="inv-items-heading" className="text-sm font-semibold text-foreground">
              {type === "all" ? "All items" : INVENTORY_TYPE_LABELS[type].many}
            </h2>
            <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
              {shown.length === items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : `${shown.length} of ${items.length}`}
            </p>
          </div>
          {shown.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((item, index) => (
                <li key={item.id} className="enter enter-card" style={{ "--enter-index": index } as CSSProperties}>
                  <button type="button" aria-pressed={focus?.id === item.id} aria-controls="inv-inspector" onClick={() => choose(item.id)} className="inv-tile" style={toneStyle(toneOf(item))}>
                    <span aria-hidden className="inv-stage">
                      <span className="inv-art">
                        <ItemArt item={item} profile={profile} samples={samples} />
                      </span>
                    </span>
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        <span aria-hidden className="inv-dot" />
                        <span className="truncate">{inventoryItemLabel(item)}</span>
                      </span>
                      <span className="line-clamp-2 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{item.name}</span>
                      <RarityTag rarity={item.rarity} className="mt-auto self-start" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <CatalogEmpty query={query} onReset={reset} />
          )}
        </section>
      </div>
    </div>
  );
}

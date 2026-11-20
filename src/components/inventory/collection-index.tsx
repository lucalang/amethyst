"use client";

import { HideInSlim, useSlimMode } from "@/components/layout/slim";
import { slimHides } from "@/lib/slim";
import "./inventory.css";
import { useRef, useState, useTransition, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookMarked, Check, CircleDashed, Loader2, RotateCcw, TriangleAlert, X } from "lucide-react";
import { CatalogEmpty, CatalogSearch, FilterSelect } from "@/components/catalog/catalog-search";
import { RarityTag } from "@/components/lootboxes/parts";
import { useMotionLevel } from "@/components/showcase/motion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { catalogMatcher } from "@/lib/catalog-search";
import { AVAILABILITY_LABELS, type IndexItem, type ItemSource } from "@/lib/collection-index";
import { GAME_SHOPS, SHOP_GAMES, type ShopGame } from "@/lib/game-cosmetics";
import { INVENTORY_TYPES, INVENTORY_TYPE_LABELS, inventoryItemLabel, type InventoryType } from "@/lib/inventory";
import { formatChance } from "@/lib/lootboxes";
import { RARITIES, RARITY_IDS, rarityRank, type RarityId } from "@/lib/rarities";
import { cn } from "@/lib/utils";
import { placeFor, TypeTab } from "./inventory-view";
import { ItemArt, TYPE_LOOK, toneOf, toneStyle, type ArtProfile as Profile, type ArtSamples as Samples } from "./item-art";

const CosmeticPreview = dynamic(() => import("@/components/arcade/shop/preview").then((mod) => mod.CosmeticPreview), {
  ssr: false,
  loading: () => <Skeleton className="mx-auto aspect-[4/3] w-full max-w-[26rem] rounded-xl" />,
});

type Ownership = "all" | "owned" | "missing";
type Sort = "catalog" | "name" | "rarity";

const OWNERSHIP: { id: Ownership; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "owned", label: "Owned" },
  { id: "missing", label: "Missing" },
];
const SORTS: { id: Sort; label: string }[] = [
  { id: "catalog", label: "Catalog" },
  { id: "name", label: "A–Z" },
  { id: "rarity", label: "Rarity" },
];

const percent = (owned: number, total: number) => (total ? Math.floor((owned / total) * 100) : 0);

export function OwnedStatus({ owned, className }: { owned: boolean; className?: string }) {
  return (
    <span className={cn("idx-status", className)} data-owned={owned}>
      {owned ? <Check aria-hidden className="size-3" /> : <CircleDashed aria-hidden className="size-3" />}
      {owned ? "Owned" : "Missing"}
    </span>
  );
}

function SourceLine({ source }: { source: ItemSource }) {
  const [text, link] = ((): [string, string] => {
    switch (source.kind) {
      case "shop":
        return [`Buy it in the ${source.label} for ${source.price.toLocaleString("en")} Coins.`, `Open the ${source.label}`];
      case "achievement":
        return [`Earn the “${source.name}” achievement: ${source.requirement}`, "View the achievement"];
      case "case":
        return [`Can drop from the ${source.name}: ${formatChance(source.chance)} chance per case opened (without boosters).`, `Open the ${source.name}`];
      case "hidden-case":
        return [`The ${source.name} includes secret rewards it doesn’t name until you own them; this item may be one of them.`, `Open the ${source.name}`];
      case "vault":
        return ["Granted by secret codes in the Vault. Codes aren’t announced, so one may not be active right now.", "Open the Vault"];
      case "tournament":
        return ["Won by placing near the top of a Daily Tournament in the Arcade.", "Open Daily Tournaments"];
    }
  })();
  return (
    <li className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2.5">
      <p className="text-sm leading-6 text-foreground/90">{text}</p>
      <HideInSlim href={source.href}>
        <Link href={source.href} className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-amethyst outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
          {link}
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </HideInSlim>
    </li>
  );
}

/** Every collectible on the site with owned/missing state, filters, and how to get each one. */
export function CollectionIndexView({
  items,
  oddsLoaded,
  initialItem,
  profile,
  samples,
}: {
  items: IndexItem[] | null;
  oddsLoaded: boolean;
  initialItem: string | null;
  profile: Profile;
  samples: Samples;
}) {
  const slim = useSlimMode();
  const router = useRouter();
  const effects = useMotionLevel();
  const [retrying, startRetry] = useTransition();
  const [type, setType] = useState<"all" | InventoryType>("all");
  const [game, setGameState] = useState<"all" | ShopGame>("all");
  /** A game's cosmetic category (board themes, skins…), offered once a single game is picked. */
  const [category, setCategory] = useState("all");
  const setGame = (next: "all" | ShopGame) => {
    setGameState(next);
    setCategory("all");
  };
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [rarity, setRarity] = useState<"all" | RarityId>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("catalog");
  const [selected, setSelected] = useState<string | null>(initialItem);
  const inspector = useRef<HTMLElement>(null);

  if (!items) {
    return (
      <div role="alert" className="enter mx-auto max-w-md rounded-2xl border border-rose/40 bg-card px-6 py-10 text-center">
        <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-2xl border border-rose/40 bg-rose/10 text-rose">
          <TriangleAlert className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">The Index couldn’t be loaded</h2>
        <p className="mt-2 text-sm text-muted-foreground">Your items are safe. Try again in a moment.</p>
        <Button className="mt-5" disabled={retrying} onClick={() => startRetry(() => router.refresh())}>
          {retrying ? <Loader2 aria-hidden className="animate-spin" /> : <RotateCcw aria-hidden />}
          Try again
        </Button>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div role="status" className="enter rounded-2xl border border-dashed border-border px-6 py-14 text-center">
        <h2 className="text-lg font-semibold">No items to index yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Collectibles will be listed here as soon as they’re added to Amethyst.</p>
      </div>
    );
  }

  const ownedTotal = items.filter((item) => item.owned).length;
  const match = catalogMatcher(query);
  const searched = match
    ? items.filter((item) => match(item.name, item.description, inventoryItemLabel(item), INVENTORY_TYPE_LABELS[item.type].one, RARITIES[item.rarity].label))
    : items;
  const byOwnership = searched.filter((item) => ownership === "all" || (ownership === "owned") === item.owned);
  const byRarity = byOwnership.filter((item) => rarity === "all" || item.rarity === rarity);
  const types = INVENTORY_TYPES.filter((id) => items.some((item) => item.type === id));
  const games = SHOP_GAMES.filter((id) => items.some((item) => item.type === "game" && item.game === id));
  const ofType = byRarity.filter((item) => type === "all" || item.type === type);
  const shown = ofType.filter(
    (item) =>
      type !== "game" ||
      game === "all" ||
      (item.type === "game" && item.game === game && (category === "all" || item.category === category)),
  );
  const categories =
    type === "game" && game !== "all"
      ? GAME_SHOPS[game].categories.filter((entry) => ofType.some((item) => item.type === "game" && item.game === game && item.category === entry.id))
      : [];
  if (sort === "name") shown.sort((a, b) => a.name.localeCompare(b.name, "en"));
  if (sort === "rarity") shown.sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity) || a.name.localeCompare(b.name, "en"));
  const focus = shown.find((item) => item.id === selected) ?? shown[0] ?? null;
  const rarities = RARITY_IDS.filter((id) => items.some((item) => item.rarity === id));
  const filtered = query.trim() !== "" || ownership !== "all" || rarity !== "all" || type !== "all";

  const chooseType = (next: "all" | InventoryType) => {
    setType(next);
    setGame("all");
  };
  const reset = () => {
    setQuery("");
    setOwnership("all");
    setRarity("all");
    chooseType("all");
  };
  const choose = (id: string) => {
    setSelected(id);
    const url = new URL(window.location.href);
    url.searchParams.set("item", id);
    window.history.replaceState(window.history.state, "", url);
    if (window.matchMedia("(max-width: 1023px)").matches) inspector.current?.scrollIntoView({ block: "start" });
  };

  const place = focus?.owned ? placeFor(focus) : null;

  return (
    <div className="grid gap-5">
      <section aria-label="Collection progress" className="enter rounded-2xl border border-border bg-[radial-gradient(28rem_10rem_at_0%_0%,rgb(var(--accent-rgb)/0.14),transparent_70%)] bg-card px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            <span className="text-2xl font-bold text-foreground tabular-nums">{ownedTotal}</span>
            <span className="tabular-nums"> of {items.length}</span> items collected
          </p>
          <p className="text-sm font-semibold text-amethyst tabular-nums">{percent(ownedTotal, items.length)}%</p>
        </div>
        <div role="progressbar" aria-label="Items collected" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={ownedTotal} className="idx-progress mt-3">
          <span style={{ width: `${(ownedTotal / items.length) * 100}%` }} />
        </div>
        {!oddsLoaded ? (
          <p role="status" className="mt-3 flex items-center gap-1.5 text-xs text-warning">
            <TriangleAlert aria-hidden className="size-3.5" />
            Case drop tables couldn’t be loaded, so Lootbox sources and odds are missing for now.
          </p>
        ) : null}
      </section>

      <div className="enter grid gap-2.5" style={{ "--enter-index": 1 } as CSSProperties}>
        <div role="group" aria-label="Item type" className="inv-types">
          <TypeTab
            icon={BookMarked}
            tone="var(--amethyst)"
            label="All"
            count={`${ownedTotal}/${items.length}`}
            pressed={type === "all"}
            onClick={() => chooseType("all")}
          />
          {types.map((id) => {
            const ofKind = items.filter((item) => item.type === id);
            return (
              <TypeTab
                key={id}
                icon={TYPE_LOOK[id].icon}
                tone={TYPE_LOOK[id].tone}
                label={INVENTORY_TYPE_LABELS[id].many}
                count={`${ofKind.filter((item) => item.owned).length}/${ofKind.length}`}
                pressed={type === id}
                onClick={() => chooseType(id)}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CatalogSearch value={query} onChange={setQuery} label="Search the Index" placeholder="Search all items" className="sm:w-64" />
          <FilterSelect label="Show" value={ownership} onChange={setOwnership} options={OWNERSHIP} />
          <FilterSelect
            label="Rarity"
            value={rarity}
            onChange={setRarity}
            options={[
              { id: "all" as const, label: "Any" },
              ...rarities.map((id) => ({
                id,
                label: (
                  <>
                    <span aria-hidden className="size-2 rounded-full" style={{ background: RARITIES[id].color }} />
                    {RARITIES[id].label}
                  </>
                ),
              })),
            ]}
          />
          {type === "game" && games.length > 1 ? (
            <FilterSelect
              label="Game"
              value={game}
              onChange={setGame}
              options={[{ id: "all" as const, label: "All games" }, ...games.map((id) => ({ id, label: GAME_SHOPS[id].title }))]}
            />
          ) : null}
          {type === "game" && game !== "all" && categories.length > 1 ? (
            <FilterSelect
              label="Kind"
              value={category}
              onChange={setCategory}
              options={[{ id: "all", label: "All kinds" }, ...categories.map((entry) => ({ id: entry.id, label: entry.label }))]}
            />
          ) : null}
          <FilterSelect label="Sort" value={sort} onChange={setSort} options={SORTS} className="sm:ml-auto" />
          {filtered ? (
            <Button type="button" variant="ghost" size="sm" className="h-9 text-muted-foreground" onClick={reset}>
              <X aria-hidden />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(19rem,23rem)_minmax(0,1fr)]">
        {focus ? (
          <aside
            id="idx-inspector"
            ref={inspector}
            aria-labelledby="idx-focus-name"
            className="inv-inspect enter scroll-mt-24 rounded-2xl border border-border bg-surface/50 p-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto"
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
              <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span aria-hidden className="inv-dot" />
                {inventoryItemLabel(focus)}
              </p>
              <h2 id="idx-focus-name" className="mt-1 text-xl font-semibold tracking-tight text-foreground [overflow-wrap:anywhere]">
                {focus.name}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{focus.description}</p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-1 font-medium text-foreground">
                  <OwnedStatus owned={focus.owned} />
                  {focus.acquiredAt ? (
                    <span suppressHydrationWarning className="mt-1 block text-muted-foreground">
                      Since {new Date(focus.acquiredAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    </span>
                  ) : null}
                </dd>
              </div>
              <div className="rounded-lg border border-border bg-foreground/[0.02] px-3 py-2">
                <dt className="text-muted-foreground">Rarity</dt>
                <dd className="mt-1 font-medium text-foreground">
                  <RarityTag rarity={focus.rarity} />
                </dd>
              </div>
            </dl>

            <section aria-labelledby="idx-sources" className="mt-4">
              <h3 id="idx-sources" className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
                {focus.owned ? "Where it comes from" : "How to get it"}
                <span className="idx-availability normal-case" data-availability={focus.availability}>
                  {AVAILABILITY_LABELS[focus.availability]}
                </span>
              </h3>
              {focus.sources.length ? (
                <ul className="mt-2 grid gap-2">
                  {focus.sources.map((source) => (
                    <SourceLine key={`${source.kind}-${source.href}`} source={source} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground">
                  This item isn’t sold or awarded anywhere right now, so it can’t currently be obtained.
                </p>
              )}
            </section>

            {place && !(slim && slimHides(place.href)) ? (
              <Button asChild variant="outline" size="sm" className="mt-4 w-full">
                <Link href={place.href}>
                  {place.label}
                  <ArrowUpRight aria-hidden />
                </Link>
              </Button>
            ) : null}
          </aside>
        ) : null}

        <section aria-labelledby="idx-items-heading" className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="idx-items-heading" className="text-sm font-semibold text-foreground">
              {type === "all" ? "All items" : INVENTORY_TYPE_LABELS[type].many}
            </h2>
            <p aria-live="polite" className="text-xs text-muted-foreground tabular-nums">
              {filtered ? `${shown.length} of ${items.length}` : `${items.length} items`}
            </p>
          </div>
          {shown.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((item, index) => (
                <li key={item.id} className="enter enter-card [contain-intrinsic-size:auto_13rem] [content-visibility:auto]" style={{ "--enter-index": index } as CSSProperties}>
                  <button
                    type="button"
                    aria-pressed={focus?.id === item.id}
                    aria-controls="idx-inspector"
                    onClick={() => choose(item.id)}
                    className="inv-tile"
                    data-owned={item.owned}
                    style={toneStyle(toneOf(item))}
                  >
                    <span aria-hidden className="inv-stage">
                      <span className="inv-art">
                        <ItemArt item={item} profile={profile} samples={samples} />
                      </span>
                    </span>
                    <OwnedStatus owned={item.owned} className="absolute top-2 right-2 z-[2]" />
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                        <span aria-hidden className="inv-dot" />
                        <span className="truncate">{inventoryItemLabel(item)}</span>
                      </span>
                      <span className="line-clamp-2 text-sm font-semibold text-foreground [overflow-wrap:anywhere]">{item.name}</span>
                      <span className="mt-auto flex flex-wrap items-center gap-1.5">
                        <RarityTag rarity={item.rarity} />
                        {item.availability === "unavailable" ? <span className="text-[11px] text-muted-foreground">Not obtainable</span> : null}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <CatalogEmpty query={query} onReset={reset}>
              {ownership === "missing" && !query.trim() && rarity === "all" ? <p className="mt-1">You own every item here.</p> : null}
            </CatalogEmpty>
          )}
        </section>
      </div>
    </div>
  );
}

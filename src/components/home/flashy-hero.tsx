import type { CSSProperties, ReactNode } from "react";
import { IntentLink as Link } from "@/components/layout/intent-link";
import { Gem } from "lucide-react";
import { CollectionIcon } from "@/components/categories/collection-icon";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { ContinueCard } from "@/components/home/archive-cards";
import { CoverFan } from "@/components/home/cover-fan";
import { DestinationHub, type HubData } from "@/components/home/destination-hub";
import { FlashyStage } from "@/components/home/flashy-stage";
import { CustomizeHomeButton } from "@/components/home/home-customizer";
import { ProfileAvatar } from "@/components/layout/profile-avatar";
import { ProfileFlair } from "@/components/layout/profile-flair";
import { accentStyle } from "@/lib/collection-identity";
import { artworkSrc, artworkVariantSrc } from "@/lib/attachments";
import { collectionPath } from "@/lib/collections";
import type { CoverShape } from "@/lib/cover-shape";
import type { HomeData, WallTile as Tile } from "@/lib/data/home";
import { cn } from "@/lib/utils";
import "./flashy-home.css";

const INNER = "mx-auto w-full max-w-[88rem] px-4 md:px-6";
const ROWS = 3;
const MAX_TILES = 24;

/** Every distinct piece of artwork Home already knows about, favourites first. */
function wallArt(home: HomeData): Tile[] {
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  const add = (src: string | null | undefined, shape: CoverShape) => {
    if (!src || seen.has(src) || tiles.length >= MAX_TILES) return;
    seen.add(src);
    tiles.push({ src, shape });
  };
  for (const item of home.fan) add(item.kind === "image" ? item.url : item.coverUrl, item.kind === "image" ? item.shape : item.coverShape);
  if (home.featured) add(home.featured.entry.coverUrl, home.featured.entry.coverShape);
  if (home.continueEntry) add(home.continueEntry.entry.coverUrl, home.continueEntry.entry.coverShape);
  for (const entry of [...home.pinned, ...home.recent]) add(entry.coverUrl, entry.coverShape);
  for (const collection of home.collections) for (const preview of collection.previews) add(preview.coverUrl, preview.coverShape);
  return tiles;
}

const WALL_WIDTHS = [128, 256, 384];

/** Dimmed backdrop art: small variants and no client component to hydrate. */
function WallImage({ src }: { src: string }) {
  if (!artworkSrc(src)) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by the authenticated artwork proxy, not next/image
    <img
      src={artworkVariantSrc(src, 256)}
      srcSet={WALL_WIDTHS.map((width) => `${artworkVariantSrc(src, width)} ${width}w`).join(", ")}
      sizes="(max-width: 63.99rem) 72px, 144px"
      alt=""
      loading="lazy"
      decoding="async"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/** Splits the wall into rows long enough to loop seamlessly across a wide screen. */
function wallRows(tiles: Tile[]): Tile[][] {
  if (!tiles.length) return [];
  const perRow = Math.max(7, Math.ceil(tiles.length / ROWS));
  return Array.from({ length: ROWS }, (_, row) =>
    Array.from({ length: perRow }, (_, index) => tiles[(row * perRow + index * (row + 1) + row * 3) % tiles.length]),
  );
}

/**
 * The Flashy Home stage: the same greeting, artwork fan, continue card and destinations as the
 * normal Home, set in front of a drifting wall of the member's own artwork.
 */
export function FlashyHero({ home, hub, heading, subline }: { home: HomeData; hub: HubData; heading: ReactNode; subline: string }) {
  const rows = wallRows(home.wallTiles ?? wallArt(home));
  const showFan = home.fan.some((item) => item.kind === "image" || item.coverUrl);

  return (
    <section aria-labelledby="home-heading" className="fh">
      <FlashyStage className="fh-stage">
        <div aria-hidden className="fh-backdrop">
          <div className="fh-aurora" />
          {rows.length ? (
            <div className="fh-wall">
              {rows.map((row, r) => (
                <div key={r} className="fh-row" data-reverse={r % 2 === 1 || undefined} style={{ "--row": r } as CSSProperties}>
                  {[0, 1].map((copy) => (
                    <div key={copy} className="fh-track">
                      {row.map((tile, index) => (
                        <span key={index} className="fh-tile" data-shape={tile.shape}>
                          <WallImage src={tile.src} />
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          <div className="fh-veil" />
          <div className="fh-sparks" />
        </div>

        <div className={cn(INNER, "fh-inner", showFan && "fh-inner-fan")}>
          <div className="fh-copy">
            <p className="fh-kicker fh-in" style={{ "--i": 0 } as CSSProperties}>
              <Gem aria-hidden className="size-3.5" />
              <span>Amethyst</span>
              {home.counts.entries ? (
                <span className="fh-kicker-count">
                  {home.counts.collections} {home.counts.collections === 1 ? "collection" : "collections"} · {home.counts.entries} {home.counts.entries === 1 ? "entry" : "entries"}
                </span>
              ) : null}
            </p>
            <div className="fh-identity fh-in" style={{ "--i": 1 } as CSSProperties}>
              {home.displayName || home.avatarUrl ? (
                <span className="fh-avatar">
                  <ProfileAvatar name={home.displayName} src={home.avatarUrl} className="size-14 text-lg md:size-20 md:text-2xl" />
                </span>
              ) : null}
              <h1 id="home-heading" className="fh-title">
                {heading}
              </h1>
            </div>
            <div className="fh-in" style={{ "--i": 2 } as CSSProperties}>
              <ProfileFlair className="mt-3 [--flair-size:0.875rem]" />
              {home.motto ? <p className="mt-2 max-w-xl text-base italic text-pretty break-words text-foreground/70">“{home.motto}”</p> : null}
              <p className="mt-3 max-w-xl text-lg text-pretty text-foreground/80">{subline}</p>
            </div>
            <div className="fh-in mt-6 flex flex-wrap items-center gap-2.5" style={{ "--i": 3 } as CSSProperties}>
              {home.collections.length ? null : (
                <NewCategoryButton label="Create your first collection" className="h-10 border-amethyst/50 bg-amethyst/15 px-4 text-foreground hover:bg-amethyst/25" />
              )}
              <CustomizeHomeButton className="bg-background/80" />
            </div>
            {home.continueEntry ? (
              <div className="fh-in fh-continue mt-6" style={{ "--i": 4 } as CSSProperties}>
                <ContinueCard item={home.continueEntry} />
              </div>
            ) : null}
          </div>
          {showFan ? (
            <div className="fh-fan">
              <span aria-hidden className="fh-fan-halo" />
              <CoverFan items={home.fan} className="mx-auto max-w-lg md:max-w-none" />
            </div>
          ) : null}
        </div>

        {home.collections.length ? (
          <nav aria-label="Jump to a collection" className={cn(INNER, "fh-jump")}>
            <ul className="fh-jump-list">
              {home.collections.map((collection, index) => (
                <li key={collection.id} className="fh-in" style={{ "--i": 5 + Math.min(index, 6), ...accentStyle(collection.accentColor) } as CSSProperties}>
                  <Link href={collectionPath(collection)} className="fh-jump-link">
                    <CollectionIcon icon={collection.icon} className="size-4 shrink-0" />
                    <span className="truncate">{collection.name}</span>
                    <span className="fh-jump-count">{collection.entryCount}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </FlashyStage>

      <div className={cn(INNER, "fh-hub")}>
        <DestinationHub data={hub} />
      </div>
    </section>
  );
}

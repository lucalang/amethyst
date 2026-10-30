"use client";

import Link from "next/link";
import { Award, Check, Lock } from "lucide-react";
import { useState } from "react";
import { CatalogEmpty, CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { useCosmetics } from "@/components/layout/cosmetics-context";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { MediaImage } from "@/components/media/media-image";
import { achievementForItem } from "@/lib/achievements";
import { ARTWORK_FRAMES, ARTWORK_FRAME_IDS, isAchievementFrameId, isShopFrameId, isUnlockableFrameId, type ArtworkFrameId } from "@/lib/frames";
import { catalogMatcher } from "@/lib/catalog-search";
import { cn } from "@/lib/utils";
import { useSetting } from "./setting-controls";

export type FrameSample = { title: string; coverUrl: string };

export function SampleArt({ sample, shape }: { sample: FrameSample | null; shape: "portrait" | "square" }) {
  return (
    <span className={cn("relative block overflow-hidden rounded-lg bg-surface", shape === "square" ? "aspect-square" : "aspect-[2/3]")}>
      {sample ? (
        <MediaImage src={sample.coverUrl} alt="" fallbackLabel={sample.title} />
      ) : (
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgb(var(--accent-rgb)/0.75),transparent_60%),radial-gradient(circle_at_75%_80%,rgb(var(--rose-rgb)/0.6),transparent_55%),linear-gradient(160deg,rgb(var(--accent-soft-rgb)/0.5),rgb(var(--paper-rgb)))]" />
      )}
    </span>
  );
}

/** Frame picker with live previews on the account's own artwork, in both cover shapes. */
export function FrameSettings({
  value,
  labelId,
  portrait,
  square,
}: {
  value: ArtworkFrameId;
  labelId: string;
  portrait: FrameSample | null;
  square: FrameSample | null;
}) {
  const [frame, setFrame] = useSetting("artworkFrame", value);
  const { owned } = useCosmetics();
  const [query, setQuery] = useState("");
  const [source, setSource] = useState<"all" | "free" | "shop" | "achievement">("all");
  const frames = ARTWORK_FRAME_IDS.filter((id) => !isShopFrameId(id) || owned.includes(id) || id === frame);
  const match = catalogMatcher(query);
  const shown = frames.filter((id) => {
    const info = ARTWORK_FRAMES[id];
    const shop = isShopFrameId(id);
    const achievement = isAchievementFrameId(id);
    const isOwned = !isUnlockableFrameId(id) || owned.includes(id);
    const ach = achievement ? achievementForItem(id) : undefined;
    const maskedAch = Boolean(ach?.hidden && !isOwned);
    if (source === "free" && (shop || achievement)) return false;
    if (source === "shop" && !shop) return false;
    if (source === "achievement" && !achievement) return false;
    return !match || match(
      info.name,
      info.description,
      info.animated ? "animated" : "static",
      shop ? "arcade shop" : achievement ? "achievement" : "free",
      maskedAch ? "hidden achievement" : ach?.name,
    );
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <CatalogSearch value={query} onChange={setQuery} label="Search artwork frames" placeholder="Search frames" />
        <div role="group" aria-label="Source" className="flex flex-wrap gap-2">
          {(["all", "free", "shop", "achievement"] as const).map((option) => (
            <FilterChip key={option} pressed={source === option} onClick={() => setSource(option)}>
              {option === "all" ? "All" : option === "free" ? "Free" : option === "shop" ? "From the shop" : "Achievements"}
            </FilterChip>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <CatalogEmpty
          query={query}
          onReset={() => {
            setQuery("");
            setSource("all");
          }}
        />
      ) : null}
      <fieldset aria-labelledby={labelId} hidden={shown.length === 0} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((id) => {
          const info = ARTWORK_FRAMES[id];
          const checked = frame === id;
          const isOwned = !isUnlockableFrameId(id) || owned.includes(id);
          const ach = isAchievementFrameId(id) ? achievementForItem(id) : undefined;
          const achLabel = ach ? (ach.hidden && !isOwned ? "Hidden achievement" : ach.name) : "Achievement";
          return (
            <label
              key={id}
              className={cn(
                "frame-option relative flex flex-col gap-3 rounded-lg border bg-white/[0.02] p-3 transition-[border-color,background-color,box-shadow] duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                isOwned ? "cursor-pointer hover:border-amethyst/40 hover:bg-amethyst/[0.04]" : "opacity-80",
                checked ? "border-amethyst/60 bg-amethyst/[0.07] shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_14px_40px_-22px_rgb(var(--accent-rgb)/0.8)]" : "border-white/[0.09]",
              )}
            >
              <input type="radio" name="artwork-frame" value={id} checked={checked} disabled={!isOwned} onChange={() => isOwned && setFrame(id)} className="sr-only" />
              <span
                aria-hidden
                className="flex items-end justify-center gap-5 rounded-md border border-border bg-[radial-gradient(18rem_10rem_at_50%_0%,rgb(var(--accent-rgb)/0.14),transparent_70%)] px-4 pt-8 pb-5"
              >
                <ArtworkFrame frame={id} className="w-[4.75rem]">
                  <SampleArt sample={portrait} shape="portrait" />
                </ArtworkFrame>
                <ArtworkFrame frame={id} className="w-[5.75rem]">
                  <SampleArt sample={square} shape="square" />
                </ArtworkFrame>
              </span>
              <span className="flex items-start gap-2.5 px-0.5">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border transition-colors",
                    checked ? "border-amethyst bg-amethyst text-amethyst-foreground" : "border-white/25",
                  )}
                >
                  {checked ? <Check className="size-3" strokeWidth={3} /> : !isOwned ? <Lock className="size-2.5 text-muted-foreground" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{info.name}</span>
                    {info.animated ? <span className="text-[11px] text-muted-foreground">Animated</span> : null}
                    {isShopFrameId(id) ? <span className="coin-ink text-[11px]">Arcade shop</span> : null}
                    {isAchievementFrameId(id) ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amethyst">
                        <Award aria-hidden className="size-3" />
                        {isOwned ? "Achievement" : achLabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{info.description}</span>
                  {!isOwned && ach ? (
                    <Link href={ach.hidden ? "/achievements" : `/achievements#${ach.id}`} className="mt-1 inline-block text-xs font-medium text-amethyst underline-offset-4 hover:underline">
                      Unlock in Achievements
                    </Link>
                  ) : null}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { CatalogSearch } from "@/components/catalog/catalog-search";
import { useCosmetics } from "@/components/layout/cosmetics-context";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { MediaImage } from "@/components/media/media-image";
import { PICKER_SEARCH_MIN, catalogMatcher } from "@/lib/catalog-search";
import { ARTWORK_FRAMES, availableFrames, resolveFrame, type ArtworkFrameId } from "@/lib/frames";
import type { CoverShape } from "@/lib/cover-shape";
import { cn } from "@/lib/utils";

/** "default" follows the account frame; anything else is this entry's own choice ("none" included). */
export type FrameChoice = "default" | ArtworkFrameId;

export const frameChoice = (entryFrame: string | null | undefined): FrameChoice => (entryFrame ? resolveFrame(entryFrame, "none") : "default");

/**
 * Per-entry frame choice with a preview on the entry's own artwork. Posts `frame` with forms
 * (via a hidden input) and also reports changes for client-side forms.
 */
export function FramePicker({
  value,
  onChange,
  accountFrame,
  coverUrl,
  coverShape,
  title,
  name = "frame",
  compact = false,
  disabled = false,
}: {
  value: FrameChoice;
  onChange: (value: FrameChoice) => void;
  accountFrame: ArtworkFrameId;
  coverUrl?: string | null;
  coverShape: CoverShape;
  title?: string;
  name?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const { owned } = useCosmetics();
  const shown = value === "default" ? accountFrame : value;
  const frames = availableFrames(owned).concat(value !== "default" && !availableFrames(owned).includes(value) ? [value] : []);
  const options: { value: FrameChoice; label: string }[] = [
    { value: "default", label: `Use my default (${ARTWORK_FRAMES[accountFrame].name})` },
    ...frames.map((frame) => ({ value: frame, label: ARTWORK_FRAMES[frame].name })),
  ];
  const [query, setQuery] = useState("");
  const searchable = options.length >= PICKER_SEARCH_MIN;
  const match = searchable ? catalogMatcher(query) : null;
  // The current choice stays listed so the group always shows what's selected.
  const listed = match
    ? options.filter((option) => option.value === value || match(option.label, option.value === "default" || option.value === "none" ? null : ARTWORK_FRAMES[option.value].description))
    : options;
  return (
    <div className="space-y-2">
      {compact ? (
        <span id={`${id}-label`} className="sr-only">
          Artwork frame
        </span>
      ) : (
        <p id={`${id}-label`} className="text-sm font-medium">
          Artwork frame
        </p>
      )}
      <input type="hidden" name={name} value={value} />
      <div className={cn("flex flex-col gap-4", !compact && "sm:flex-row sm:items-start")}>
        {compact ? null : (
          <div aria-hidden className="flex shrink-0 justify-center rounded-md border border-white/[0.08] bg-[radial-gradient(14rem_8rem_at_50%_0%,rgb(var(--accent-rgb)/0.14),transparent_70%)] px-5 py-4">
            <ArtworkFrame frame={shown} className={coverShape === "square" ? "w-24" : "w-20"}>
              <span className={cn("relative block overflow-hidden rounded-lg bg-surface", coverShape === "square" ? "aspect-square" : "aspect-[2/3]")}>
                {coverUrl ? (
                  <MediaImage src={coverUrl} alt="" sizes="auto, 96px" fallbackLabel={title} />
                ) : (
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,rgb(var(--accent-rgb)/0.75),transparent_60%),radial-gradient(circle_at_75%_80%,rgb(var(--rose-rgb)/0.6),transparent_55%),linear-gradient(160deg,rgb(var(--accent-soft-rgb)/0.5),rgb(var(--paper-rgb)))]" />
                )}
              </span>
            </ArtworkFrame>
          </div>
        )}
        <div className="grid min-w-0 flex-1 gap-2">
        {searchable ? <CatalogSearch value={query} onChange={setQuery} label="Search frames" placeholder="Search frames" className="sm:w-full" /> : null}
        <div role="radiogroup" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="grid gap-1">
          {listed.map((option) => {
            const checked = value === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "group/frame-opt flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-1.5 text-sm transition-[color,background-color,border-color,scale] duration-150 select-none active:scale-[0.985] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100",
                  disabled && "pointer-events-none opacity-60",
                  checked
                    ? "border-amethyst/60 bg-amethyst/[0.1] text-foreground shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.06)]"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-foreground/[0.04] hover:text-foreground",
                )}
              >
                <input type="radio" name={`${id}-choice`} value={option.value} checked={checked} disabled={disabled} onChange={() => onChange(option.value)} className="sr-only" />
                <span aria-hidden className={cn("grid size-4 shrink-0 place-items-center rounded-full border transition-[border-color,background-color,scale] duration-150", checked ? "scale-105 border-amethyst bg-amethyst text-amethyst-foreground" : "border-input group-hover/frame-opt:border-amethyst/65")}>
                  {checked ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
              </label>
            );
          })}
          {match && listed.length <= 1 ? <p className="px-3 py-1.5 text-xs text-muted-foreground">No other frames match “{query.trim()}”.</p> : null}
        </div>
        </div>
      </div>
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Shown on collection cards, in Showcase, and in the artwork viewer. “Use my default” follows your{" "}
        <Link href="/customization/frames" className="text-amethyst underline-offset-4 hover:underline">
          account frame
        </Link>{" "}
        when it changes; “No frame” keeps this entry unframed. More frames are in the{" "}
        <Link href="/arcade/shop" className="text-amethyst underline-offset-4 hover:underline">
          Arcade shop
        </Link>
        .
      </p>
    </div>
  );
}

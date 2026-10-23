"use client";

import { Check } from "lucide-react";
import { ArtworkFrame } from "@/components/media/artwork-frame";
import { MediaImage } from "@/components/media/media-image";
import { ARTWORK_FRAME_IDS, ARTWORK_FRAMES, type ArtworkFrameId } from "@/lib/frames";
import { cn } from "@/lib/utils";
import { useSetting } from "./setting-controls";

export type FrameSample = { title: string; coverUrl: string };

function SampleArt({ sample, shape }: { sample: FrameSample | null; shape: "portrait" | "square" }) {
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

  return (
    <fieldset aria-labelledby={labelId} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ARTWORK_FRAME_IDS.map((id) => {
        const info = ARTWORK_FRAMES[id];
        const checked = frame === id;
        return (
          <label
            key={id}
            className={cn(
              "frame-option relative flex cursor-pointer flex-col gap-3 rounded-lg border bg-white/[0.02] p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-amethyst/40 hover:bg-amethyst/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              checked ? "border-amethyst/60 bg-amethyst/[0.07] shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_14px_40px_-22px_rgb(var(--accent-rgb)/0.8)]" : "border-white/[0.09]",
            )}
          >
            <input type="radio" name="artwork-frame" value={id} checked={checked} onChange={() => setFrame(id)} className="sr-only" />
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
                {checked ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{info.name}</span>
                  {info.animated ? <span className="text-[11px] text-muted-foreground">Animated</span> : null}
                </span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{info.description}</span>
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

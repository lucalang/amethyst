"use client";

import { useState } from "react";
import { Gem } from "lucide-react";
import { ARTWORK_WIDTHS, artworkSrc, artworkVariantSrc } from "@/lib/attachments";
import type { AvatarDecorationId } from "@/lib/cosmetics";
import { AvatarDecoration } from "./avatar-decoration";
import { useCosmetics } from "./cosmetics-context";
import { cn } from "@/lib/utils";

/** Up to two initials from a display name ("Ada Lovelace" → "AL"). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0]?.toLocaleUpperCase() ?? "")
    .join("");
}

/**
 * The account's avatar: the chosen picture, else the name's initials, else a quiet gem.
 * Pictures load through the same private image routes as artwork. An owned decoration is drawn
 * around it without touching the picture.
 */
export function ProfileAvatar({
  name,
  src,
  className,
  alt = "",
  decoration,
}: {
  name: string | null | undefined;
  src: string | null | undefined;
  className?: string;
  alt?: string;
  /** Defaults to the signed-in account's equipped decoration; null shows none. */
  decoration?: AvatarDecorationId | null;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const [failedVariant, setFailedVariant] = useState<string | null>(null);
  const equipped = useCosmetics().avatarDecoration;
  const shownDecoration = decoration === undefined ? equipped : decoration;
  const resolved = src && src !== failed ? artworkSrc(src) : null;
  const letters = initials(name ?? "");
  const avatar = (
    <span
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[radial-gradient(circle_at_30%_20%,rgb(var(--accent-rgb)/0.35),transparent_65%),linear-gradient(160deg,var(--surface-raised),var(--background))] font-semibold text-amethyst ring-1 ring-amethyst/30 select-none",
        className,
      )}
    >
      {resolved ? (
        // eslint-disable-next-line @next/next/no-img-element -- own upload or the authenticated image proxy
        <img
          src={src && failedVariant !== src ? artworkVariantSrc(src, 128) : resolved}
          srcSet={src && failedVariant !== src ? ARTWORK_WIDTHS.filter((width) => width <= 512).map((width) => `${artworkVariantSrc(src, width)} ${width}w`).join(", ") : undefined}
          sizes="auto, 128px"
          loading="lazy"
          alt=""
          decoding="async"
          className="absolute inset-0 size-full object-cover"
          onError={() => failedVariant !== src ? setFailedVariant(src ?? null) : setFailed(src ?? null)}
        />
      ) : letters ? (
        <span className="leading-none">{letters}</span>
      ) : (
        <Gem className="size-[45%]" />
      )}
    </span>
  );
  if (!shownDecoration) return avatar;
  return (
    <span className="relative inline-flex shrink-0">
      {avatar}
      <AvatarDecoration decoration={shownDecoration} />
    </span>
  );
}

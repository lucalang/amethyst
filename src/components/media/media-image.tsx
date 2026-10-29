"use client";

import { useState } from "react";
import { ARTWORK_WIDTHS, artworkSrc, artworkVariantSrc } from "@/lib/attachments";
import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
  /** Text used for the fallback tile when no artwork is available. */
  fallbackLabel?: string;
};

/** Remote artwork served same-origin through the image proxy, with a stable fallback tile. */
export function MediaImage({ src, alt, className, priority, sizes = "auto, (min-width: 1280px) 240px, (min-width: 768px) 33vw, 50vw", fallbackLabel }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [failedVariant, setFailedVariant] = useState<string | null>(null);
  const resolved = src && src !== failedSrc ? artworkSrc(src) : null;
  if (!resolved) {
    const initials = (fallbackLabel ?? alt)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("");
    return (
      <div
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={cn(
          "absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgb(var(--accent-rgb)/0.22),transparent_60%),linear-gradient(160deg,var(--surface-raised),var(--background))] text-lg font-semibold text-muted-foreground",
          className,
        )}
      >
        <span aria-hidden>{initials || "?"}</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served by the authenticated /api/image proxy, not next/image
    <img
      src={src && failedVariant !== src ? artworkVariantSrc(src, 512) : resolved}
      srcSet={src && failedVariant !== src ? ARTWORK_WIDTHS.map((width) => `${artworkVariantSrc(src, width)} ${width}w`).join(", ") : undefined}
      sizes={priority ? sizes.replace(/^auto,\s*/, "") : sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      onError={() => failedVariant !== src ? setFailedVariant(src ?? null) : setFailedSrc(src ?? null)}
    />
  );
}

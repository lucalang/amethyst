"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { checkImageUrl, imageProxyUrl } from "@/lib/validation/image-url";

type Props = {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  /** Text used for the fallback tile when no artwork is available. */
  fallbackLabel?: string;
};

/** Remote artwork served same-origin through the image proxy, with a stable fallback tile. */
export function MediaImage({ src, alt, className, priority, fallbackLabel }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = src && src !== failedSrc && checkImageUrl(src).ok;
  if (!usable) {
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
          "absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_20%,rgb(165_124_255/0.22),transparent_60%),linear-gradient(160deg,var(--surface-raised),#000)] text-lg font-semibold text-muted-foreground",
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
      src={imageProxyUrl(src)}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
      onError={() => setFailedSrc(src)}
    />
  );
}

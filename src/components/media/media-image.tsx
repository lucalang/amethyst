"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  alt: string;
  sizes: string;
  className?: string;
  priority?: boolean;
  /** Text used for the fallback tile when no artwork is available. */
  fallbackLabel?: string;
};

/** Artwork from allow-listed hosts via next/image, with a stable fallback tile. */
export function MediaImage({ src, alt, sizes, className, priority, fallbackLabel }: Props) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
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
          "absolute inset-0 grid place-items-center bg-gradient-to-br from-surface-raised via-secondary to-background text-lg font-semibold text-muted-foreground",
          className,
        )}
      >
        <span aria-hidden>{initials || "?"}</span>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
      onError={() => setFailed(true)}
    />
  );
}

"use client";

import { useState } from "react";
import { Gem } from "lucide-react";
import { artworkSrc } from "@/lib/attachments";
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
 * Pictures load through the same private image routes as artwork.
 */
export function ProfileAvatar({ name, src, className, alt = "" }: { name: string | null | undefined; src: string | null | undefined; className?: string; alt?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const resolved = src && src !== failed ? artworkSrc(src) : null;
  const letters = initials(name ?? "");
  return (
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
        <img src={resolved} alt="" decoding="async" className="absolute inset-0 size-full object-cover" onError={() => setFailed(src ?? null)} />
      ) : letters ? (
        <span className="leading-none">{letters}</span>
      ) : (
        <Gem className="size-[45%]" />
      )}
    </span>
  );
}

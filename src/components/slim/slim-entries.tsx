import Link from "next/link";
import type { ReactNode } from "react";
import { MediaImage } from "@/components/media/media-image";
import { entryPath } from "@/lib/collections";
import type { SlimEntry } from "@/lib/data/slim";
import { SLIM_BASE } from "@/lib/edition";

export function SlimEntryGrid({ children }: { children: ReactNode }) {
  return <ul className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">{children}</ul>;
}

/** An entry as a cover tile linking to its Slim workspace. */
export function SlimEntryTile({ entry, meta }: { entry: SlimEntry; meta?: string }) {
  return (
    <li className="min-w-0">
      <Link href={`${SLIM_BASE}${entryPath(entry)}`} className="slim-tile">
        <span className="slim-tile-art" data-square={entry.square || undefined}>
          <MediaImage src={entry.coverUrl} alt="" sizes="(min-width: 1024px) 160px, 30vw" fallbackLabel={entry.title} />
        </span>
        <span>
          <span className="slim-tile-title">{entry.title}</span>
          {meta ? <span className="slim-tile-meta block">{meta}</span> : null}
        </span>
      </Link>
    </li>
  );
}

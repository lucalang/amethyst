"use client";

import type { CSSProperties } from "react";
import { MediaImage } from "@/components/media/media-image";
import { THEMES, type ThemeId } from "@/lib/themes";

/**
 * A miniature of the real workspace in a theme: header with the entry's own cover, the seam, the framed workspace
 * with its explorer (one file selected), file bar and a note. It uses the same `data-ws` parts and stylesheet as
 * the workspace itself, so what you see here is what the entry gets.
 */
export function WorkspaceThemePreview({ id, title, coverUrl }: { id: ThemeId; title: string; coverUrl: string | null }) {
  const headings = THEMES[id].headings;
  return (
    <div className="ws-mini entry-workspace relative isolate" data-theme-preview={id} data-workspace-theme={id} aria-hidden>
      <div data-ws="header" className="relative">
        <div data-ws="banner" className="relative h-14 overflow-hidden">
          {coverUrl ? (
            <span className="absolute inset-0 scale-125 opacity-45 blur-md">
              <MediaImage src={coverUrl} alt="" sizes="200px" />
            </span>
          ) : null}
          <span className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgb(var(--accent-rgb)/0.3),transparent_62%)]" />
          <span className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-background" />
        </div>
        <div className="relative -mt-8 flex items-end gap-2 px-2.5 pb-2.5">
          <span className="relative block aspect-[2/3] w-8 shrink-0 overflow-hidden rounded-[3px] bg-secondary shadow-md ring-1 ring-white/10">
            <MediaImage src={coverUrl} alt="" sizes="40px" fallbackLabel={title} />
          </span>
          <span className="min-w-0 pb-0.5">
            <span data-preview-heading className="block truncate text-[12px] leading-tight font-semibold" style={{ fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif" }}>
              {title}
            </span>
            <span className="mt-1 flex gap-1">
              <span className="h-1.5 w-7 rounded-full bg-amethyst/60" />
              <span className="h-1.5 w-5 rounded-full bg-muted-foreground/40" />
            </span>
          </span>
        </div>
      </div>
      <div className="px-2.5 pt-2.5 pb-2.5">
        <div data-ws="frame" className="relative grid h-24 grid-cols-[38%_1fr] rounded-md border border-border bg-black">
          <div data-ws="explorer" className="space-y-1 overflow-hidden rounded-l-md border-r border-border bg-surface p-1.5">
            <span className="block h-1 w-6 rounded-full bg-muted-foreground/40" />
            {[0.75, 1, 0.6, 0.85].map((width, i) => (
              <span key={i} className="tree-row relative flex h-3.5 items-center rounded-sm pl-1.5" data-selected={i === 1 ? "true" : "false"}>
                <span className="h-1 rounded-full bg-foreground/55" style={{ width: `${width * 70}%` } as CSSProperties} />
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <div data-ws="toolbar" className="relative flex h-4 items-center gap-1 border-b border-border px-1.5">
              <span className="h-1 w-8 rounded-full bg-muted-foreground/45" />
              <span className="h-1 w-5 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="space-y-1 p-1.5">
              <span className="block h-1.5 w-1/2 rounded-full" style={{ background: headings.h1 }} />
              <span className="block h-1 w-[85%] rounded-full bg-foreground/35" />
              <span className="block h-1 w-[70%] rounded-full bg-foreground/35" />
              <span className="block h-1 w-1/3 rounded-full" style={{ background: headings.h2 }} />
              <span className="block h-1 w-[78%] rounded-full bg-foreground/35" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

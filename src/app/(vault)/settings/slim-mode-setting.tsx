"use client";

import type { CSSProperties } from "react";
import { Feather } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { SLIM_HIDDEN_AREAS, SLIM_NAME } from "@/lib/slim";
import { cn } from "@/lib/utils";
import { useSetting } from "./setting-controls";

/**
 * The Slim Amethyst switch: the first thing in General settings. It saves through the normal preference system
 * (so it follows the account to every device) and the layout refreshes at once, so the navigation changes as
 * soon as it's flipped. It stays here while Slim is on, so it can always be turned off again.
 */
export function SlimModeSetting({ value }: { value: boolean }) {
  const [on, update] = useSetting("slimMode", value);
  return (
    <section
      id="slim-mode-label-setting"
      aria-labelledby="slim-mode-label"
      className={cn("ui-panel scroll-mt-40 overflow-hidden p-5 transition-[border-color,box-shadow] duration-300 md:p-6", on && "border-amethyst/55 shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_24px_60px_-40px_rgb(var(--accent-rgb)/0.9)]")}
      data-glow={on || undefined}
      style={{ "--tone": "var(--amethyst)" } as CSSProperties}
    >
      <div className="flex flex-wrap items-start gap-4">
        <span aria-hidden className="ui-hero-icon">
          <Feather className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="slim-mode-label" className="text-lg font-semibold tracking-tight">
            {SLIM_NAME}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-pretty text-muted-foreground">
            A calmer Amethyst with the same look, your archive and everything you own. It hides these areas from menus, Home and search until you turn it off:
          </p>
          <ul aria-label="Hidden in Slim" className="mt-3 flex flex-wrap gap-1.5">
            {SLIM_HIDDEN_AREAS.map((area) => (
              <li key={area.id} className={cn("ui-pill", on && "line-through decoration-muted-foreground/60")}>
                {area.label}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Nothing is deleted or reset: your data, settings and equipped cosmetics stay exactly as they are.</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface/60 py-2.5 pr-4 pl-3">
          <Switch id="slim-mode-switch" aria-labelledby="slim-mode-label" checked={on} onCheckedChange={update} className="scale-125" />
          <label htmlFor="slim-mode-switch" className={cn("cursor-pointer text-sm font-semibold", on ? "text-amethyst" : "text-muted-foreground")}>
            {on ? "On" : "Off"}
          </label>
        </div>
      </div>
    </section>
  );
}

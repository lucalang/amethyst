"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Moon, Sun } from "lucide-react";
import { CatalogEmpty, CatalogSearch, FilterChip } from "@/components/catalog/catalog-search";
import { catalogMatcher } from "@/lib/catalog-search";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { useSetting } from "./setting-controls";

/** Applies a theme to the open page right away; the saved value re-renders it from the server. */
function applyTheme(theme: ThemeId) {
  document.querySelectorAll<HTMLElement>("[data-app-theme]").forEach((element) => {
    element.dataset.appTheme = theme;
  });
}

function ThemePreview({ id }: { id: ThemeId }) {
  const headings = THEMES[id].headings;
  return (
    <span data-theme-preview={id} aria-hidden className="relative isolate block overflow-hidden rounded-md border border-border p-3.5">
      <span className="flex items-center justify-between gap-2 border-b border-border pb-2.5">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-amethyst" />
          <span className="h-1.5 w-12 rounded-full bg-foreground/70" />
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-7 rounded-full bg-muted-foreground/50" />
          <span className="h-1.5 w-7 rounded-full bg-amethyst/70" />
          <span className="h-1.5 w-7 rounded-full bg-muted-foreground/50" />
        </span>
      </span>
      <span
        data-preview-heading
        className="mt-3 block truncate text-lg leading-tight font-semibold"
        style={{ color: headings.h1, fontFamily: "var(--font-display), ui-sans-serif, system-ui, sans-serif", fontSizeAdjust: "var(--heading-adjust)" }}
      >
        Your archive
      </span>
      <span className="mt-1 block truncate text-xs text-muted-foreground">
        <span style={{ color: headings.h2 }}>Notes</span> · <span style={{ color: headings.h3 }}>checklists</span> · progress
      </span>
      <span className="mt-3 flex items-end gap-2">
        <span className="aspect-[2/3] w-9 rounded-sm bg-[linear-gradient(160deg,rgb(var(--accent-rgb)/0.9),rgb(var(--paper-rgb)/0.9))] ring-1 ring-white/10" />
        <span className="aspect-[2/3] w-9 rounded-sm bg-[linear-gradient(160deg,rgb(var(--rose-rgb)/0.85),rgb(var(--paper-rgb)/0.9))] ring-1 ring-white/10" />
        <span className="aspect-square w-9 rounded-sm bg-[linear-gradient(160deg,rgb(var(--accent-soft-rgb)/0.7),rgb(var(--paper-rgb)/0.9))] ring-1 ring-white/10" />
        <span className="ml-auto flex flex-col items-end gap-1.5">
          <span className="rounded-full bg-rose/15 px-1.5 py-px text-[9px] font-semibold text-rose">Important</span>
          <span className="rounded-md bg-primary px-2 py-1 text-[10px] font-semibold text-primary-foreground shadow-[0_6px_16px_-8px_rgb(var(--accent-rgb)/0.9)]">
            New entry
          </span>
        </span>
      </span>
      <span className="mt-3 flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2 py-1.5">
        <span className="grid size-3 place-items-center rounded-full border border-amethyst bg-amethyst text-amethyst-foreground">
          <Check className="size-2" strokeWidth={3} />
        </span>
        <span className="h-1.5 w-20 rounded-full bg-foreground/35" />
      </span>
    </span>
  );
}

/** Theme picker with live previews. The choice applies at once and is saved to the account. */
export function ThemeSettings({ value, labelId }: { value: ThemeId; labelId: string }) {
  const [theme, setTheme] = useSetting("theme", value);
  useEffect(() => applyTheme(theme), [theme]);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"all" | "dark" | "light">("all");
  const match = catalogMatcher(query);
  const shown = THEME_IDS.filter((id) => {
    const info = THEMES[id];
    return (mode === "all" || info.mode === mode) && (!match || match(info.name, info.description, info.mode));
  });

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <CatalogSearch value={query} onChange={setQuery} label="Search themes" placeholder="Search themes" />
        <div role="group" aria-label="Mode" className="flex flex-wrap gap-2">
          {(["all", "dark", "light"] as const).map((option) => (
            <FilterChip key={option} pressed={mode === option} onClick={() => setMode(option)}>
              {option === "all" ? "All" : option === "dark" ? "Dark" : "Light"}
            </FilterChip>
          ))}
        </div>
      </div>
      {shown.length === 0 ? (
        <CatalogEmpty
          query={query}
          onReset={() => {
            setQuery("");
            setMode("all");
          }}
        />
      ) : null}
      <fieldset aria-labelledby={labelId} hidden={shown.length === 0} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((id) => {
          const info = THEMES[id];
          const checked = theme === id;
          return (
            <label
              key={id}
              className={cn(
                "group/theme relative flex cursor-pointer flex-col gap-3 rounded-lg border bg-white/[0.02] p-3 transition-[border-color,background-color,box-shadow] duration-200 hover:border-amethyst/40 hover:bg-amethyst/[0.04] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked ? "border-amethyst/60 bg-amethyst/[0.07] shadow-[0_0_0_1px_rgb(var(--accent-rgb)/0.35),0_14px_40px_-22px_rgb(var(--accent-rgb)/0.8)]" : "border-white/[0.09]",
              )}
            >
              <input type="radio" name="theme" value={id} checked={checked} onChange={() => setTheme(id)} className="sr-only" />
              <ThemePreview id={id} />
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
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {info.mode === "light" ? <Sun aria-hidden className="size-3" /> : <Moon aria-hidden className="size-3" />}
                      {info.mode === "light" ? "Light" : "Dark"}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{info.description}</span>
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>
    </div>
  );
}

/** Shown when the account picked its own heading colors, which every theme keeps. */
export function CustomHeadingsNote() {
  return (
    <p className="mt-4 text-xs leading-5 text-muted-foreground">
      You picked your own heading colors, so notes keep them on every theme.{" "}
      <Link href="/settings/editor#writing" className="text-amethyst underline-offset-4 hover:underline">
        Reset them in Editor
      </Link>{" "}
      to use each theme’s palette.
    </p>
  );
}

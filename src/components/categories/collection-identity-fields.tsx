"use client";

import { useMemo, useState } from "react";
import { Check, LibraryBig, RotateCcw, Search } from "lucide-react";
import { DynamicIcon, iconNames, type IconName } from "lucide-react/dynamic";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACCENT_SWATCHES, accentStyle, readableAccent } from "@/lib/collection-identity";
import { cn } from "@/lib/utils";

const KNOWN = new Set<string>(iconNames);
const SUGGESTED = [
  "library-big", "book-open", "gamepad-2", "film", "tv", "music", "headphones", "camera", "palette", "pen-tool", "code", "rocket",
  "star", "heart", "sparkles", "gem", "crown", "trophy", "map", "compass", "plane", "utensils", "coffee", "dumbbell",
  "leaf", "flower-2", "sword", "shield", "ghost", "skull", "cat", "dog", "graduation-cap", "briefcase", "house", "globe",
].filter((name) => KNOWN.has(name)) as IconName[];
const RESULT_LIMIT = 84;

/** A collection icon in client components (loads the icon on demand; library icon while loading or unknown). */
export function ClientCollectionIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  if (!icon || !KNOWN.has(icon)) return <LibraryBig aria-hidden className={className} />;
  return <DynamicIcon name={icon as IconName} aria-hidden className={className} fallback={() => <LibraryBig aria-hidden className={className} />} />;
}

/** Searchable picker over the full lucide icon set. `null` means the default icon. */
export function IconPicker({ id, value, onChange, accent, disabled }: { id: string; value: string | null; onChange: (value: string | null) => void; accent: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase().replace(/\s+/g, "-");
  const matches = useMemo(() => {
    if (!normalized) return SUGGESTED;
    const starts: IconName[] = [];
    const contains: IconName[] = [];
    for (const name of iconNames) {
      if (name.startsWith(normalized)) starts.push(name);
      else if (name.includes(normalized)) contains.push(name);
    }
    return [...starts, ...contains];
  }, [normalized]);
  const shown = matches.slice(0, RESULT_LIMIT);
  const style = accentStyle(accent);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            disabled={disabled}
            style={style}
            className={cn(
              "flex h-11 min-w-0 flex-1 items-center gap-3 rounded-md border border-white/[0.12] bg-black/50 px-3 text-left text-sm transition-colors outline-none hover:border-amethyst/40 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            )}
          >
            <span aria-hidden className={cn("grid size-7 shrink-0 place-items-center rounded-md border", style ? "border-[var(--ca-line)] bg-[var(--ca-soft)] text-[var(--ca)]" : "border-amethyst/25 bg-amethyst/10 text-amethyst")}>
              <ClientCollectionIcon icon={value} className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">{value ?? "Default icon"}</span>
            <span className="text-xs text-muted-foreground">Change</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] border border-white/[0.08] bg-surface-raised p-3">
          <div className="relative">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${iconNames.length.toLocaleString("en")} icons`}
              aria-label="Search icons"
              className="h-9 pl-9"
              autoFocus
            />
          </div>
          <p aria-live="polite" className="mt-2 text-[11px] text-muted-foreground">
            {normalized ? (matches.length ? `${matches.length.toLocaleString("en")} ${matches.length === 1 ? "match" : "matches"}${matches.length > RESULT_LIMIT ? `, showing the first ${RESULT_LIMIT}` : ""}` : "No icons match.") : "Suggestions. Search for anything else."}
          </p>
          <div role="group" aria-label="Icons" className="mt-2 grid max-h-64 grid-cols-7 gap-1 overflow-y-auto pr-1">
            {shown.map((name) => {
              const selected = value === name;
              return (
                <button
                  key={name}
                  type="button"
                  aria-pressed={selected}
                  aria-label={name}
                  title={name}
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "grid aspect-square place-items-center rounded-md border text-foreground/85 transition-colors outline-none hover:border-amethyst/40 hover:bg-amethyst/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-amethyst/60 bg-amethyst/15 text-amethyst" : "border-transparent",
                  )}
                >
                  <DynamicIcon name={name} aria-hidden className="size-4" fallback={() => <span className="size-4 rounded-sm bg-white/[0.06]" />} />
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="icon" className="size-11 shrink-0 text-muted-foreground" aria-label="Reset icon to default" title="Default icon" disabled={disabled || !value} onClick={() => onChange(null)}>
        <RotateCcw aria-hidden />
      </Button>
    </div>
  );
}

const HEX = /^#?([0-9a-f]{6})$/i;

/** Accent swatches, a full color picker and a hex field. `null` means the default amethyst look. */
export function AccentPicker({ id, value, onChange, disabled }: { id: string; value: string | null; onChange: (value: string | null) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value ?? "");
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value ?? "");
  }
  const invalid = draft !== "" && !HEX.test(draft);
  const readable = value ? readableAccent(value) : null;

  function commitDraft() {
    if (draft === "") return onChange(null);
    const match = HEX.exec(draft.trim());
    if (match) onChange(`#${match[1].toLowerCase()}`);
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
        {ACCENT_SWATCHES.map((swatch) => {
          const selected = value === swatch.value;
          return (
            <button
              key={swatch.value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={swatch.name}
              title={swatch.name}
              disabled={disabled}
              onClick={() => onChange(swatch.value)}
              className={cn(
                "grid size-8 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-[box-shadow,scale] outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-foreground motion-reduce:hover:scale-100",
                selected && "ring-2 ring-foreground",
              )}
              style={{ backgroundColor: swatch.value }}
            >
              {selected ? <Check aria-hidden className="size-4 text-black" strokeWidth={3} /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative grid size-11 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-white/[0.12] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring" title="Pick any color">
          <span className="sr-only">Pick any color</span>
          <span aria-hidden className="absolute inset-1.5 rounded-sm" style={{ background: value ?? "conic-gradient(#f87171,#fbbf24,#a3e635,#2dd4bf,#38bdf8,#a57cff,#f472a8,#f87171)" }} />
          <input type="color" value={value ?? "#a57cff"} disabled={disabled} onChange={(event) => onChange(event.target.value.toLowerCase())} className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
        <Input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitDraft}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitDraft();
            }
          }}
          placeholder="#a57cff"
          maxLength={7}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          disabled={disabled}
          className="h-11 w-28 border-white/[0.12] bg-black/50 font-mono text-sm"
        />
        <Button type="button" variant="ghost" className="h-11 gap-2 px-3 text-muted-foreground" disabled={disabled || !value} onClick={() => onChange(null)}>
          <RotateCcw aria-hidden className="size-4" /> Default
        </Button>
        {readable ? (
          <span
            className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium"
            style={{ color: readable, borderColor: `${readable}59`, backgroundColor: `${readable}1f` }}
          >
            Preview
          </span>
        ) : null}
      </div>
      <p id={`${id}-hint`} className={cn("text-xs", invalid ? "text-rose" : "text-muted-foreground")}>
        {invalid
          ? "Use a hex color like #a57cff."
          : readable && readable !== value
            ? "Lightened slightly on dark surfaces so text and focus rings stay readable."
            : "Used for this collection’s icon, highlights and focus rings only."}
      </p>
    </div>
  );
}

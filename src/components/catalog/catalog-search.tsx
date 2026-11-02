"use client";

import { useRef, type ReactNode } from "react";
import { RotateCcw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OWNERSHIP_LABELS, type Ownership } from "@/lib/catalog-search";
import { cn } from "@/lib/utils";

/** Search box for a catalog: Escape or the clear button empties it. */
export function CatalogSearch({
  value,
  onChange,
  label,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div role="search" className={cn("relative w-full sm:w-64", className)}>
      <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          // Searching never submits a surrounding form.
          if (event.key === "Enter") event.preventDefault();
          if (event.key === "Escape" && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange("");
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="h-9 pr-8 pl-8 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-[color,background-color,scale] duration-150 outline-none hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-90 active:bg-foreground/[0.12] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** A pressable filter pill, optionally with a count. */
export function FilterChip({ pressed, onClick, count, children }: { pressed: boolean; onClick: () => void; count?: number; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "group/chip inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,scale] duration-150 ease-out outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-[0.96] active:duration-75 motion-reduce:transition-none motion-reduce:active:scale-100",
        pressed
          ? "border-amethyst/65 bg-amethyst/[0.14] text-foreground shadow-[inset_0_1px_0_rgb(var(--ink-rgb)/0.08),0_6px_18px_-10px_rgb(var(--accent-rgb)/0.75)] hover:border-amethyst/85 hover:bg-amethyst/[0.2]"
          : "border-border bg-foreground/[0.02] text-muted-foreground hover:border-amethyst/45 hover:bg-amethyst/[0.07] hover:text-foreground active:bg-amethyst/[0.11]",
      )}
    >
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "text-xs tabular-nums transition-colors",
            pressed ? "font-semibold text-amethyst" : "text-muted-foreground group-hover/chip:text-foreground/80",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function OwnershipFilter({ value, onChange, counts }: { value: Ownership; onChange: (value: Ownership) => void; counts?: Record<Ownership, number> }) {
  return (
    <div role="group" aria-label="Ownership" className="flex flex-wrap gap-2">
      {(Object.keys(OWNERSHIP_LABELS) as Ownership[]).map((option) => (
        <FilterChip key={option} pressed={value === option} onClick={() => onChange(option)} count={counts?.[option]}>
          {OWNERSHIP_LABELS[option]}
        </FilterChip>
      ))}
    </div>
  );
}

/** Shown when search and filters leave nothing; offers to reset them. */
export function CatalogEmpty({ query, onReset, children }: { query: string; onReset: () => void; children?: ReactNode }) {
  return (
    <div role="status" className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      <p>{query.trim() ? <>Nothing matches “{query.trim()}” here.</> : "Nothing matches these filters."}</p>
      {children}
      <Button type="button" variant="outline" size="sm" onClick={onReset} className="mt-3.5">
        <RotateCcw aria-hidden />
        Clear search and filters
      </Button>
    </div>
  );
}

"use client";

import { useRef, type ReactNode } from "react";
import { Search, X } from "lucide-react";
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
          className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        pressed ? "border-amethyst/60 bg-amethyst/[0.12] text-foreground" : "border-border text-muted-foreground hover:border-amethyst/40 hover:text-foreground",
      )}
    >
      {children}
      {count !== undefined ? <span className="text-xs text-muted-foreground tabular-nums">{count}</span> : null}
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
      <button type="button" onClick={onReset} className="mt-3 text-sm font-medium text-amethyst underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
        Clear search and filters
      </button>
    </div>
  );
}

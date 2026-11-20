"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Search, SearchX, X } from "lucide-react";
import { CARD_GROUPS, CARDS, type Card, type CardGroup, type Gem, type Traits } from "@/lib/who-am-i";
import { cn } from "@/lib/utils";
import { GEM_COLORS, HAIR } from "./portrait";

const fold = (text: string) => text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Filler words a player may type ("do I have a beard") that no card needs to match. */
const FILLER = new Set(["a", "an", "the", "is", "am", "are", "i", "me", "my", "do", "does", "have", "has", "wear", "wearing", "of", "on"]);
const HAYSTACK = new Map(CARDS.map((card) => [card.id, fold(`${card.prompt} ${card.short} ${card.group} ${card.keywords}`)]));

/** Cards whose prompt, label, category or keywords contain every typed word. */
export function matchCards(query: string): readonly Card[] {
  const words = fold(query).split(/[^a-z0-9]+/).filter((word) => word && !FILLER.has(word));
  if (words.length === 0) return CARDS;
  return CARDS.filter((card) => words.every((word) => HAYSTACK.get(card.id)?.includes(word)));
}

function Swatch({ card }: { card: Card }) {
  if (card.trait === "gem") {
    return (
      <svg viewBox="0 0 10 12" aria-hidden className="size-3 shrink-0">
        <path d="M5 0.6 L9.4 5 L5 11.4 L0.6 5 Z" fill={GEM_COLORS[card.value as Gem]} stroke="#fff" strokeOpacity="0.8" strokeWidth="0.8" />
      </svg>
    );
  }
  if (card.trait === "hairColor") {
    return <span aria-hidden className="size-3 shrink-0 rounded-full border border-white/50" style={{ background: HAIR[card.value as Traits["hairColor"]].base }} />;
  }
  return null;
}

/**
 * The question cards: a search field, category filters and compact grouped chips. Keyboard: type to filter,
 * Enter picks the first match (Enter again asks it), arrow keys move between chips, Escape clears the search.
 */
export function QuestionPicker({ selected, onSelect, onAsk, asked, disabled }: {
  selected: string | null;
  onSelect: (card: string) => void;
  onAsk: (card: string) => void;
  /** Your earlier card questions: card id → answer (undefined while unanswered). */
  asked: Map<string, boolean | undefined>;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CardGroup | "All">("All");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchId = useId();
  const matches = useMemo(() => matchCards(query), [query]);
  const visible = group === "All" ? matches : matches.filter((card) => card.group === group);
  const groups = CARD_GROUPS.filter((name) => visible.some((card) => card.group === name));
  const open = (name: CardGroup | "All") => CARDS.filter((card) => (name === "All" || card.group === name) && !asked.has(card.id)).length;

  const chips = () => [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[data-wai-chip]:not(:disabled)") ?? [])];

  function onListKey(event: KeyboardEvent<HTMLDivElement>) {
    const list = chips();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: list.length - 1 }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    if (next < 0 && (event.key === "ArrowUp" || event.key === "ArrowLeft")) {
      searchRef.current?.focus();
      return;
    }
    list[Math.max(0, Math.min(list.length - 1, next))]?.focus();
  }

  function onSearchKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && query) {
      event.preventDefault();
      event.stopPropagation();
      setQuery("");
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      chips()[0]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      const first = visible.find((card) => !asked.has(card.id));
      if (!first) return;
      if (selected === first.id && !disabled) onAsk(first.id);
      else onSelect(first.id);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor={searchId} className="sr-only">Search questions</label>
        <input
          ref={searchRef}
          id={searchId}
          type="search"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setGroup("All");
          }}
          onKeyDown={onSearchKey}
          placeholder="Search questions: hat, blue, smile…"
          className="h-9 w-full rounded-lg border border-border bg-background/60 pr-9 pl-8 text-sm outline-none placeholder:text-muted-foreground/80 focus-visible:border-amethyst focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            className="absolute top-1/2 right-1.5 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Clear search"
          >
            <X aria-hidden className="size-3.5" />
          </button>
        ) : null}
      </div>

      {query ? null : (
        <div role="group" aria-label="Question categories" className="wai-scroll-x -mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {(["All", ...CARD_GROUPS] as const).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={group === name}
              onClick={() => setGroup(name)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring",
                group === name ? "bg-foreground text-background" : "bg-foreground/[0.07] text-muted-foreground hover:bg-foreground/[0.12] hover:text-foreground",
              )}
            >
              {name}
              <span className={cn("tabular-nums", group === name ? "opacity-70" : "opacity-60")}>{open(name)}</span>
            </button>
          ))}
        </div>
      )}

      <div ref={listRef} onKeyDown={onListKey} className="grid gap-2">
        {groups.length === 0 ? (
          <div role="status" className="grid justify-items-center gap-2 rounded-lg border border-dashed border-border px-3 py-5 text-center">
            <SearchX aria-hidden className="size-6 text-muted-foreground" />
            <p className="text-sm">
              No question matches <span className="font-semibold break-all">“{query}”</span>.
            </p>
            <p className="text-xs text-muted-foreground">Try a trait like gem, hair, hat, glasses, beard, scarf or companion.</p>
            <button type="button" onClick={() => setQuery("")} className="rounded-md px-2 py-1 text-xs font-semibold text-amethyst outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              Clear search
            </button>
          </div>
        ) : (
          groups.map((name) => (
            <div key={name} role="group" aria-label={name} className="grid gap-1 sm:grid-cols-[5.25rem_minmax(0,1fr)] sm:items-start sm:gap-2">
              <span aria-hidden className="pt-1.5 text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">{name}</span>
              <div className="flex flex-wrap gap-1.5">
                {visible.filter((card) => card.group === name).map((card) => {
                  const used = asked.has(card.id);
                  const answer = asked.get(card.id);
                  const active = selected === card.id;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      data-wai-chip
                      disabled={used || disabled}
                      aria-pressed={active}
                      title={card.prompt}
                      aria-label={used ? `${card.prompt} Already asked: ${answer === undefined ? "waiting for the answer" : answer ? "yes" : "no"}.` : card.prompt}
                      onClick={() => onSelect(card.id)}
                      onDoubleClick={() => !used && !disabled && onAsk(card.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && active && !disabled) {
                          event.preventDefault();
                          onAsk(card.id);
                        }
                      }}
                      className={cn(
                        "wai-chip inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold outline-none transition-[background-color,border-color,transform,color] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring",
                        active
                          ? "wai-chip-active border-amethyst bg-amethyst text-amethyst-foreground shadow-[0_0_0_3px_color-mix(in_srgb,var(--amethyst)_30%,transparent)]"
                          : used
                            ? "border-dashed border-border bg-transparent text-muted-foreground"
                            : "border-border bg-surface-raised/70 hover:-translate-y-px hover:border-amethyst/60 motion-reduce:hover:translate-y-0",
                      )}
                    >
                      <Swatch card={card} />
                      {card.short}
                      {used ? (
                        <span className={cn("inline-flex items-center gap-0.5 rounded px-1 text-[0.6rem] font-bold uppercase", answer === undefined ? "bg-foreground/10" : answer ? "bg-emerald-400/20 text-emerald-300" : "bg-rose-400/20 text-rose-300")}>
                          {answer === undefined ? "…" : answer ? <><Check aria-hidden className="size-2.5" strokeWidth={3} />Yes</> : <><X aria-hidden className="size-2.5" strokeWidth={3} />No</>}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
      <p aria-live="polite" className="sr-only">{query ? `${visible.length} question${visible.length === 1 ? "" : "s"} match.` : ""}</p>
    </div>
  );
}

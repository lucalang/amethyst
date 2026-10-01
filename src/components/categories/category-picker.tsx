"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Plus, Search, Settings2, Tags, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api-client";
import { categoryKey, categoryNameSchema, sortCategories, type Category } from "@/lib/categories";
import { cn } from "@/lib/utils";

/** Merge server categories with ones created on this page (server names win, e.g. after a rename). */
function useCategoryList(categories: readonly Category[]) {
  const [created, setCreated] = useState<Category[]>([]);
  const all = useMemo(() => {
    const byId = new Map(created.map((category) => [category.id, category]));
    for (const category of categories) byId.set(category.id, category);
    return sortCategories([...byId.values()]);
  }, [categories, created]);
  return { all, remember: (category: Category) => setCreated((current) => [...current, category]) };
}

async function createCategory(name: string): Promise<Category> {
  const { category } = await apiFetch<{ category: Category }>("/api/categories", { method: "POST", json: { name } });
  return category;
}

type Option = { type: "category"; category: Category } | { type: "create"; name: string };

/**
 * Searchable multi-select list (combobox + listbox with checkboxes). Optionally
 * offers to create the typed name when no category matches it.
 */
function CategoryOptions({
  categories,
  selected,
  onToggle,
  onCreate,
  counts,
  label,
}: {
  categories: readonly Category[];
  selected: readonly string[];
  onToggle: (category: Category) => void;
  onCreate?: (name: string) => Promise<void>;
  counts?: Record<string, number>;
  label: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = query.trim();
  const matches = trimmed ? categories.filter((category) => categoryKey(category.name).includes(categoryKey(trimmed))) : categories;
  const exact = categories.some((category) => categoryKey(category.name) === categoryKey(trimmed));
  const options: Option[] = [
    ...matches.map((category) => ({ type: "category" as const, category })),
    ...(onCreate && trimmed && !exact ? [{ type: "create" as const, name: trimmed }] : []),
  ];
  const activeIndex = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (index: number) => `${listId}-option-${index}`;

  useEffect(() => {
    document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, listId]);

  async function choose(option: Option | undefined) {
    if (!option) return;
    if (option.type === "category") {
      onToggle(option.category);
      return;
    }
    const parsed = categoryNameSchema.safeParse(option.name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid name.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      await onCreate?.(parsed.data);
      setQuery("");
      setActive(0);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the category.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col">
      <div className="flex h-11 items-center gap-2.5 border-b border-white/[0.07] px-3">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length ? optionId(activeIndex) : undefined}
          aria-label={label}
          value={query}
          maxLength={80}
          placeholder={onCreate ? "Search or create…" : "Search categories…"}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (options.length) setActive((activeIndex + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
            } else if (event.key === "Enter") {
              event.preventDefault();
              if (!creating) void choose(options[activeIndex]);
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/80"
        />
      </div>
      <ul id={listId} role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
        {options.map((option, index) => {
          const isActive = index === activeIndex;
          if (option.type === "create") {
            return (
              <li
                key="create"
                id={optionId(index)}
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActive(index)}
                onClick={() => void choose(option)}
                className={cn(
                  "mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-amethyst/35 px-2.5 py-2 text-sm transition-colors",
                  isActive ? "border-amethyst/70 bg-amethyst/15" : "hover:bg-amethyst/10",
                )}
              >
                {creating ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-amethyst" /> : <Plus aria-hidden className="size-4 shrink-0 text-amethyst" />}
                <span className="min-w-0 truncate">
                  Create <span className="font-semibold text-foreground">“{option.name}”</span>
                </span>
              </li>
            );
          }
          const { category } = option;
          const checked = selected.includes(category.id);
          const count = counts?.[category.id] ?? 0;
          return (
            <li
              key={category.id}
              id={optionId(index)}
              role="option"
              aria-selected={checked}
              title={category.name}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => setActive(index)}
              onClick={() => void choose(option)}
              className={cn(
                "group/option flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                isActive ? "bg-amethyst/[0.14] text-foreground shadow-[inset_2px_0_0_var(--amethyst)]" : "text-foreground/85",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-4 shrink-0 place-items-center rounded-[4px] border transition-[background-color,border-color,scale] duration-150",
                  checked ? "scale-105 border-amethyst bg-amethyst text-primary-foreground" : "border-muted-foreground/50 group-hover/option:border-amethyst/70",
                )}
              >
                {checked ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1 truncate">{category.name}</span>
              {counts ? <span className={cn("shrink-0 text-xs tabular-nums", count ? "text-muted-foreground" : "text-muted-foreground/45")}>{count}</span> : null}
            </li>
          );
        })}
        {options.length === 0 ? (
          <li role="presentation" className="px-2.5 py-6 text-center text-sm text-muted-foreground">
            {categories.length === 0 ? (onCreate ? "No categories yet. Type a name to create one." : "No categories yet.") : "No matching categories."}
          </li>
        ) : null}
      </ul>
      {error ? (
        <p role="alert" className="border-t border-white/[0.07] px-3 py-2 text-xs text-rose">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CategoryChip({ name, onRemove, className }: { name: string; onRemove?: () => void; className?: string }) {
  return (
    <span
      title={name}
      className={cn(
        "inline-flex h-7 max-w-full min-w-0 items-center gap-1 rounded-full bg-amethyst/[0.12] pr-1 pl-2.5 text-xs font-medium text-foreground ring-1 ring-amethyst/30 transition-[box-shadow,background-color] duration-200 hover:bg-amethyst/[0.18] hover:ring-amethyst/55",
        !onRemove && "pr-2.5",
        className,
      )}
    >
      <span className="max-w-[14rem] truncate">{name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="grid size-5 shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,background-color,rotate] duration-200 outline-none hover:rotate-90 hover:bg-rose/20 hover:text-rose focus-visible:bg-rose/20 focus-visible:text-rose focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

/**
 * Optional multi-category field for entry forms. Submits the selection as
 * repeated hidden `name` inputs; new categories are created and selected inline.
 */
export function CategorySelect({
  categories,
  defaultSelected = [],
  name = "categoryIds",
  onSelectionChange,
}: {
  categories: readonly Category[];
  defaultSelected?: readonly string[];
  name?: string;
  onSelectionChange?: (selected: Category[]) => void;
}) {
  const labelId = useId();
  const { all, remember } = useCategoryList(categories);
  const [selected, setSelected] = useState<string[]>(() => [...defaultSelected]);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chosen = selected.map((id) => all.find((category) => category.id === id)).filter((category): category is Category => Boolean(category));

  function update(next: string[], known: readonly Category[] = all) {
    setSelected(next);
    onSelectionChange?.(next.map((id) => known.find((category) => category.id === id)).filter((category): category is Category => Boolean(category)));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-sm leading-none font-medium">
          Categories
        </span>
        <span className="text-xs text-muted-foreground">Optional</span>
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-input bg-black/40 p-1.5 transition-[border-color,box-shadow] duration-200 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 hover:border-amethyst/40"
      >
        {chosen.map((category) => (
          <CategoryChip
            key={category.id}
            name={category.name}
            onRemove={() => {
              update(selected.filter((id) => id !== category.id));
              triggerRef.current?.focus();
            }}
          />
        ))}
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label={chosen.length ? "Add or remove categories" : "Add categories"}
              className="group/add inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-[color,background-color] duration-200 outline-none hover:bg-amethyst/10 hover:text-amethyst focus-visible:bg-amethyst/10 focus-visible:text-amethyst focus-visible:ring-2 focus-visible:ring-ring/60 data-[state=open]:bg-amethyst/15 data-[state=open]:text-amethyst"
            >
              <Plus aria-hidden className="size-3.5 transition-transform duration-200 group-hover/add:rotate-90 group-data-[state=open]/add:rotate-45" />
              {chosen.length ? "Add" : "Add categories"}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
            <CategoryOptions
              categories={all}
              selected={selected}
              label="Categories"
              onToggle={(category) =>
                update(selected.includes(category.id) ? selected.filter((id) => id !== category.id) : [...selected, category.id])
              }
              onCreate={async (categoryName) => {
                const category = await createCategory(categoryName);
                remember(category);
                if (!selected.includes(category.id)) update([...selected, category.id], [...all, category]);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}

/** Library toolbar filter: entries matching ANY selected category. */
export function CategoryFilter({
  categories,
  selected,
  counts,
  onChange,
}: {
  categories: readonly Category[];
  selected: readonly string[];
  counts: Record<string, number>;
  onChange: (next: string[]) => void;
}) {
  const active = selected.length > 0;
  const first = active ? categories.find((category) => category.id === selected[0]) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? `Categories: ${selected.length} selected` : "Filter by category"}
          data-active={active}
          className="group/cat flex h-10 min-w-[9.5rem] flex-1 items-center gap-2 rounded-md border border-input bg-surface px-3 text-left text-sm transition-[color,background-color,border-color,box-shadow] duration-200 outline-none select-none hover:border-amethyst/50 hover:bg-surface-raised hover:shadow-[0_0_0_3px_rgb(165_124_255/0.08)] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 data-[active=true]:border-amethyst/45 data-[active=true]:bg-amethyst/10 data-[state=open]:border-amethyst/60 sm:w-48 sm:flex-none"
        >
          <Tags aria-hidden className={cn("size-4 shrink-0 max-sm:hidden", active ? "text-amethyst" : "text-muted-foreground")} />
          <span className="min-w-0 flex-1 truncate">{active ? (selected.length === 1 && first ? first.name : "Categories") : "All categories"}</span>
          {selected.length > 1 ? (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amethyst px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums">
              {selected.length}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-[rotate,color] duration-200 group-hover/cat:text-amethyst group-data-[state=open]/cat:rotate-180 group-data-[state=open]/cat:text-amethyst"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(18rem,calc(100vw-2rem))] gap-0 overflow-hidden p-0">
        <CategoryOptions
          categories={categories}
          selected={selected}
          counts={counts}
          label="Filter by category"
          onToggle={(category) => onChange(selected.includes(category.id) ? selected.filter((id) => id !== category.id) : [...selected, category.id])}
        />
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] px-2 py-1.5">
          <Link
            href="/settings#categories"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground transition-colors outline-none hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Settings2 aria-hidden className="size-3.5" /> Manage
          </Link>
          <button
            type="button"
            disabled={!active}
            onClick={() => onChange([])}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-amethyst transition-colors outline-none hover:bg-amethyst/10 focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:text-muted-foreground/50"
          >
            Clear selection
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

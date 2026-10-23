"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useOptimistic, useTransition } from "react";
import { ArrowDownWideNarrow, ListFilter, Loader2, Search, X } from "lucide-react";
import { CategoryChip, CategoryFilter } from "@/components/categories/category-picker";
import { MAX_QUERY_LENGTH, useLibrary } from "@/components/media/library-view";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CATEGORY_PARAM, type Category } from "@/lib/categories";
import type { LibrarySearch } from "@/lib/progress/library";
import { FOCUS_SEARCH_KEY } from "@/lib/shortcuts";

export function LibraryControls({
  search,
  label,
  collectionId,
  categories,
}: {
  search: LibrarySearch;
  label: string;
  collectionId: string;
  categories: Category[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [selectedCategories, setSelectedCategories] = useOptimistic(search.categories);
  const { query, setQuery, flushQuery, categoryCounts } = useLibrary();

  useEffect(() => {
    try {
      if (sessionStorage.getItem(FOCUS_SEARCH_KEY) !== "1") return;
      sessionStorage.removeItem(FOCUS_SEARCH_KEY);
    } catch {
      return;
    }
    document.getElementById("library-search")?.focus();
  }, []);

  // Typed queries reach the URL after a short pause; write any pending one first so it is kept.
  function currentParams() {
    flushQuery();
    return new URLSearchParams(window.location.search);
  }

  function update(key: string, value: string, defaultValue: string) {
    const next = currentParams();
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function updateCategories(ids: string[]) {
    const next = currentParams();
    startTransition(() => {
      setSelectedCategories(ids);
      if (ids.length) next.set(CATEGORY_PARAM, ids.join(","));
      else next.delete(CATEGORY_PARAM);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  const activeCategories = selectedCategories
    .map((id) => categories.find((category) => category.id === id))
    .filter((category): category is Category => Boolean(category));
  const filtered = search.status !== "all" || query.trim() !== "" || activeCategories.length > 0;

  return (
    <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2">
      <form
        action={pathname}
        method="get"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          flushQuery();
        }}
        className="group/search flex h-10 w-full min-w-0 items-center gap-2.5 rounded-md border border-input bg-surface px-3 transition-[border-color,box-shadow,background-color] duration-200 hover:border-amethyst/50 hover:bg-surface-raised hover:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.08)] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 sm:w-80"
      >
        <label htmlFor="library-search" className="sr-only">
          Search {label}
        </label>
        {pending ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-amethyst" /> : <Search aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[color,scale] duration-200 group-hover/search:text-amethyst group-focus-within/search:scale-110 group-focus-within/search:text-amethyst" />}
        <input
          id="library-search"
          name="q"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={MAX_QUERY_LENGTH}
          placeholder={`Search ${label.toLowerCase()}`}
          autoComplete="off"
          enterKeyHint="search"
          className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {search.status !== "all" ? <input type="hidden" name="status" value={search.status} /> : null}
        {search.sort !== "recent" ? <input type="hidden" name="sort" value={search.sort} /> : null}
        {activeCategories.length ? <input type="hidden" name={CATEGORY_PARAM} value={activeCategories.map((category) => category.id).join(",")} /> : null}
      </form>
      <Select value={search.status} onValueChange={(value) => update("status", value, "all")}>
        <SelectTrigger className="min-w-[9.5rem] flex-1 sm:w-44 sm:flex-none" aria-label="Filter by progress" data-active={search.status !== "all"}>
          <ListFilter aria-hidden className="size-4 text-muted-foreground max-sm:hidden" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="all">Any progress</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="not_started">Not started</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>
      <CategoryFilter
        categories={categories}
        collectionId={collectionId}
        selected={activeCategories.map((category) => category.id)}
        counts={categoryCounts}
        onChange={updateCategories}
      />
      <Select value={search.sort} onValueChange={(value) => update("sort", value, "recent")}>
        <SelectTrigger className="min-w-[9.5rem] flex-1 sm:w-48 sm:flex-none" aria-label="Sort" data-active={search.sort !== "recent"}>
          <ArrowDownWideNarrow aria-hidden className="size-4 text-muted-foreground max-sm:hidden" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" align="start">
          <SelectItem value="recent">Recently active</SelectItem>
          <SelectItem value="added">Recently added</SelectItem>
          <SelectItem value="title">Title A–Z</SelectItem>
          <SelectItem value="progress">Most progress</SelectItem>
        </SelectContent>
      </Select>
      {filtered ? (
        <Button asChild variant="outline" size="icon-lg" className="size-10 bg-surface" aria-label="Clear filters" title="Clear filters">
          <Link href={pathname} replace scroll={false}>
            <X aria-hidden />
          </Link>
        </Button>
      ) : null}
      <span role="status" className="sr-only">{pending ? "Updating library" : ""}</span>
    </div>
    {activeCategories.length ? (
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Active label filters" role="group">
        <span className="mr-1 text-xs text-muted-foreground">{activeCategories.length === 1 ? "Label" : "All of"}</span>
        {activeCategories.map((category) => (
          <CategoryChip
            key={category.id}
            name={category.name}
            onRemove={() => updateCategories(activeCategories.filter((other) => other.id !== category.id).map((other) => other.id))}
          />
        ))}
        <button
          type="button"
          onClick={() => updateCategories([])}
          className="ml-1 inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Clear labels
        </button>
      </div>
    ) : null}
    </div>
  );
}

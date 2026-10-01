"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ArrowDownWideNarrow, ListFilter, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LibrarySearch } from "@/lib/progress/library";

export function LibraryControls({ search, label }: { search: LibrarySearch; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function update(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(params.toString());
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const filtered = search.status !== "all" || search.q;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        action={pathname}
        method="get"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          update("q", String(new FormData(event.currentTarget).get("q") ?? "").trim(), "");
        }}
        className="group/search flex h-10 w-full min-w-0 items-center gap-2.5 rounded-md border border-input bg-surface px-3 transition-[border-color,box-shadow,background-color] duration-200 hover:border-amethyst/50 hover:bg-surface-raised hover:shadow-[0_0_0_3px_rgb(165_124_255/0.08)] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40 sm:w-80"
      >
        <label htmlFor="library-search" className="sr-only">
          Search {label}
        </label>
        {pending ? <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-amethyst" /> : <Search aria-hidden className="size-4 shrink-0 text-muted-foreground transition-[color,scale] duration-200 group-hover/search:text-amethyst group-focus-within/search:scale-110 group-focus-within/search:text-amethyst" />}
        <input
          id="library-search"
          key={search.q}
          name="q"
          type="search"
          defaultValue={search.q}
          placeholder={`Search ${label.toLowerCase()}`}
          autoComplete="off"
          className="h-full w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {search.status !== "all" ? <input type="hidden" name="status" value={search.status} /> : null}
        {search.sort !== "recent" ? <input type="hidden" name="sort" value={search.sort} /> : null}
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
  );
}

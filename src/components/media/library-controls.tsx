"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
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
      <form action={pathname} method="get" role="search" className="relative w-full sm:w-72">
        <label htmlFor="library-search" className="sr-only">
          Search {label}
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="library-search"
          key={search.q}
          name="q"
          type="search"
          defaultValue={search.q}
          placeholder={`Search ${label.toLowerCase()}`}
          autoComplete="off"
          className="h-9 w-full rounded-md border border-input bg-surface pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {search.status !== "all" ? <input type="hidden" name="status" value={search.status} /> : null}
        {search.sort !== "recent" ? <input type="hidden" name="sort" value={search.sort} /> : null}
      </form>
      <Select value={search.status} onValueChange={(value) => update("status", value, "all")}>
        <SelectTrigger size="sm" className="w-36" aria-label="Filter by progress">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Any progress</SelectItem>
          <SelectItem value="in_progress">In progress</SelectItem>
          <SelectItem value="not_started">Not started</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
        </SelectContent>
      </Select>
      <Select value={search.sort} onValueChange={(value) => update("sort", value, "recent")}>
        <SelectTrigger size="sm" className="w-40" aria-label="Sort">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="recent">Recently active</SelectItem>
          <SelectItem value="added">Recently added</SelectItem>
          <SelectItem value="title">Title A–Z</SelectItem>
          <SelectItem value="progress">Most progress</SelectItem>
        </SelectContent>
      </Select>
      {filtered ? (
        <Button asChild variant="ghost" size="sm">
          <Link href={pathname} replace scroll={false}>
            <X aria-hidden /> Clear
          </Link>
        </Button>
      ) : null}
      {pending ? <Loader2 aria-label="Updating" className="size-4 animate-spin text-muted-foreground" /> : null}
    </div>
  );
}

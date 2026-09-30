"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LibrarySearch } from "@/lib/progress/library";
import { cn } from "@/lib/utils";

const KINDS: { value: LibrarySearch["kind"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "franchise", label: "Anime" },
  { value: "game", label: "Games" },
  { value: "custom", label: "Custom" },
];

export function LibraryControls({ search }: { search: LibrarySearch }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function hrefWith(key: string, value: string, defaultValue: string) {
    const next = new URLSearchParams(params.toString());
    if (value === defaultValue) next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  function update(key: string, value: string, defaultValue: string) {
    startTransition(() => router.replace(hrefWith(key, value, defaultValue), { scroll: false }));
  }

  const filtered = search.kind !== "all" || search.status !== "all" || search.q;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <nav aria-label="Filter by type" className="flex rounded-md border border-border bg-surface p-0.5">
        {KINDS.map((kind) => (
          <Link
            key={kind.value}
            href={hrefWith("kind", kind.value, "all")}
            replace
            scroll={false}
            aria-current={search.kind === kind.value ? "page" : undefined}
            className={cn(
              "inline-flex min-h-8 items-center rounded-sm px-3 text-sm text-muted-foreground transition-colors hover:text-foreground",
              search.kind === kind.value && "bg-secondary text-foreground",
            )}
          >
            {kind.label}
          </Link>
        ))}
      </nav>
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
        <SelectTrigger size="sm" className="w-40" aria-label="Sort library">
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

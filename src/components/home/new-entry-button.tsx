"use client";

import Link from "next/link";
import { ChevronDown, LibraryBig, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { LibraryCategory } from "@/lib/collections";

/** "New entry": goes straight to the only category, or asks which one. */
export function NewEntryButton({ collections }: { collections: LibraryCategory[] }) {
  if (collections.length === 0) return null;
  if (collections.length === 1) {
    return (
      <Button asChild size="sm" className="h-9 gap-2 px-3">
        <Link href={`/${collections[0].id}/new`}>
          <Plus aria-hidden /> New entry
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="h-9 gap-2 px-3">
          <Plus aria-hidden /> New entry <ChevronDown aria-hidden className="-mr-0.5 size-3.5 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="max-h-80 w-60 overflow-y-auto border border-white/[0.08] bg-surface-raised p-1.5 shadow-xl shadow-black/50">
        <DropdownMenuLabel className="px-2 py-2 text-xs font-medium text-muted-foreground">Add to category</DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 my-1 bg-white/[0.07]" />
        {collections.map((collection) => (
          <DropdownMenuItem key={collection.id} asChild className="min-h-9 gap-2.5">
            <Link href={`/${collection.id}/new`}>
              <LibraryBig aria-hidden className="text-amethyst/80" />
              <span className="truncate">{collection.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

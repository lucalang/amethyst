"use client";

import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { ClientCollectionIcon } from "@/components/categories/collection-identity-fields";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";

/** "New entry": goes straight to the only collection, or asks which one. */
export function NewEntryButton({ collections, className, label = "New entry" }: { collections: LibraryCategory[]; className?: string; label?: string }) {
  if (collections.length === 0) return null;
  if (collections.length === 1) {
    return (
      <Button asChild size="sm" className={cn("h-9 gap-2 px-3", className)}>
        <Link href={`${collectionPath(collections[0])}/new`}>
          <Plus aria-hidden /> {label}
        </Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className={cn("h-9 gap-2 px-3", className)}>
          <Plus aria-hidden /> {label} <ChevronDown aria-hidden className="-mr-0.5 size-3.5 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="max-h-80 w-60 overflow-y-auto border border-white/[0.08] bg-surface-raised p-1.5 shadow-xl shadow-black/50">
        <DropdownMenuLabel className="px-2 py-2 text-xs font-medium text-muted-foreground">Add to collection</DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-0 my-1 bg-white/[0.07]" />
        {collections.map((collection) => (
          <DropdownMenuItem key={collection.id} asChild className="min-h-9 gap-2.5">
            <Link href={`${collectionPath(collection)}/new`}>
              <span aria-hidden style={accentStyle(collection.accent_color)} className={cn("size-4 shrink-0", collection.accent_color ? "text-[var(--ca)]" : "text-amethyst/80")}>
                <ClientCollectionIcon icon={collection.icon} className="size-full" />
              </span>
              <span className="truncate">{collection.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

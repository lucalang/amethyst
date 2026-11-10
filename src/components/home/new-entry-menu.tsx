"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type NewEntryTarget = { id: string; href: string; name: string; accented: boolean; style?: CSSProperties; icon: ReactNode };

/** Collection picker for "New entry"; icons arrive pre-rendered from the server. */
export function NewEntryMenu({ targets, className, label }: { targets: NewEntryTarget[]; className?: string; label: string }) {
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
        {targets.map((target) => (
          <DropdownMenuItem key={target.id} asChild className="min-h-9 gap-2.5">
            <Link href={target.href}>
              <span aria-hidden style={target.style} className={cn("size-4 shrink-0", target.accented ? "text-[var(--ca)]" : "text-amethyst/80")}>
                {target.icon}
              </span>
              <span className="truncate">{target.name}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

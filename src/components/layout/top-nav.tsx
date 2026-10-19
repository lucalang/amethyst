"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem, LibraryBig, LogOut, Settings } from "lucide-react";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span aria-hidden className="brand-gem grid size-7 place-items-center rounded-md bg-amethyst/15 text-amethyst ring-1 ring-amethyst/40">
        <Gem className="size-4" />
      </span>
      <span>
        Amethyst <span className="text-amethyst">Archives</span>
      </span>
    </span>
  );
}

export function TopNav({ displayName, collections }: { displayName: string; collections: LibraryCategory[] }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label="Amethyst Archives home">
          <BrandMark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>

        <nav aria-label="Categories" className="collection-nav-strip hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto border-l border-white/[0.08] py-1 pl-4 md:flex">
          {collections.map((item) => {
            const href = `/${item.id}`;
            const active = isActive(pathname, href);
            return (
              <Link
                key={item.id}
                href={href}
                title={item.name}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-link relative flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,border-color] duration-200 outline-none hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-foreground focus-visible:text-foreground",
                  active && "border-amethyst/25 bg-amethyst/10 text-foreground",
                )}
              >
                <LibraryBig aria-hidden className={cn("size-3.5 shrink-0", active ? "text-amethyst" : "text-muted-foreground/65")} />
                <span className="max-w-40 truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <NewCategoryButton />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu" className="shrink-0">
                <span aria-hidden className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold uppercase ring-1 ring-border">
                  {displayName.slice(0, 1) || "?"}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{displayName}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action="/auth/signout" method="post">
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut aria-hidden /> Sign out
                  </button>
                </DropdownMenuItem>
              </form>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export function MobileTabBar({ collections }: { collections: LibraryCategory[] }) {
  const pathname = usePathname();
  const settingsActive = isActive(pathname, "/settings");
  return (
    <nav aria-label="Primary" className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="collection-nav-strip flex min-w-0 flex-1 overflow-x-auto px-1">
        {collections.map((collection) => {
          const href = `/${collection.id}`;
          const active = isActive(pathname, href);
          return (
            <li key={collection.id} className="w-24 shrink-0">
              <Link
                href={href}
                title={collection.name}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground transition-colors active:bg-amethyst/10",
                  active && "text-amethyst",
                )}
              >
                <span className={cn("grid h-7 w-11 place-items-center rounded-md transition-colors", active && "bg-amethyst/15 ring-1 ring-amethyst/25")}>
                  <LibraryBig aria-hidden className="size-4" />
                </span>
                <span className="w-full truncate px-2">{collection.name}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/settings"
        aria-current={settingsActive ? "page" : undefined}
        className={cn("flex min-h-16 w-20 shrink-0 flex-col items-center justify-center gap-1 border-l border-white/[0.08] text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground", settingsActive && "text-amethyst")}
      >
        <span className={cn("grid h-7 w-11 place-items-center rounded-md", settingsActive && "bg-amethyst/15 ring-1 ring-amethyst/25")}><Settings aria-hidden className="size-4" /></span>
        Settings
      </Link>
    </nav>
  );
}

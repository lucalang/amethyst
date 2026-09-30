"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Gamepad2, LibraryBig, LogOut, Plus, Search, Settings, SquarePen, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Library", icon: LibraryBig },
  { href: "/entries/new", label: "New", icon: Plus },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function isActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname.startsWith("/franchise") || (pathname.startsWith("/entries/") && pathname !== "/entries/new");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TopNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = pathname === "/" ? (searchParams.get("q") ?? "") : "";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight" aria-label="Archive home">
          <span aria-hidden className="grid size-7 place-items-center rounded-md bg-jade text-sm font-bold text-jade-foreground">
            A
          </span>
          <span className="hidden sm:inline">Archive</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.slice(0, 1).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                isActive(pathname, item.href) && "bg-secondary text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <form action="/" method="get" role="search" className="relative ml-auto w-full max-w-xs flex-1 md:max-w-sm">
          <label htmlFor="vault-search" className="sr-only">
            Search your library
          </label>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            id="vault-search"
            key={query}
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search library"
            autoComplete="off"
            className="h-9 w-full rounded-md border border-input bg-surface pr-3 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </form>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="hidden gap-1 sm:inline-flex">
              <Plus aria-hidden />
              New
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/entries/new?kind=anime">
                <Tv aria-hidden /> Anime
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/entries/new?kind=game">
                <Gamepad2 aria-hidden /> Game
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/entries/new?kind=custom">
                <SquarePen aria-hidden /> Custom entry
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account menu" className="shrink-0">
              <span aria-hidden className="grid size-7 place-items-center rounded-md bg-secondary text-xs font-semibold uppercase">
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
    </header>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                  active && "text-jade",
                )}
              >
                <Icon aria-hidden className="size-5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

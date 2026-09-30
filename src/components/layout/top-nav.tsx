"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gamepad2, Gem, LogOut, Plus, Settings, Shapes, Tv } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { COLLECTIONS, collectionFromPath } from "@/lib/collections";
import { cn } from "@/lib/utils";

const COLLECTION_ICONS = { anime: Tv, games: Gamepad2, other: Shapes } as const;

function navItems(hasOther: boolean) {
  const collections = [COLLECTIONS.anime, COLLECTIONS.games, ...(hasOther ? [COLLECTIONS.other] : [])];
  return collections.map((collection) => ({ href: `/${collection.slug}`, label: collection.label, icon: COLLECTION_ICONS[collection.slug] }));
}

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span aria-hidden className="grid size-7 place-items-center rounded-md bg-amethyst/15 text-amethyst ring-1 ring-amethyst/40">
        <Gem className="size-4" />
      </span>
      <span>
        Amethyst <span className="text-amethyst">Archives</span>
      </span>
    </span>
  );
}

export function TopNav({ displayName, hasOther }: { displayName: string; hasOther: boolean }) {
  const pathname = usePathname();
  const current = collectionFromPath(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/anime" className="shrink-0 rounded-md" aria-label="Amethyst Archives home">
          <BrandMark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>

        <nav aria-label="Collections" className="hidden items-center gap-1 md:flex">
          {navItems(hasOther).map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  active && "text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-amethyst",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {current ? (
            <Button asChild size="sm" className="hidden gap-1 sm:inline-flex">
              <Link href={`/${current.slug}/new`}>
                <Plus aria-hidden />
                {current.newLabel}
              </Link>
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="hidden gap-1 sm:inline-flex">
                  <Plus aria-hidden />
                  New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem asChild>
                  <Link href="/anime/new">
                    <Tv aria-hidden /> Anime
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/games/new">
                    <Gamepad2 aria-hidden /> Game
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

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

export function MobileTabBar({ hasOther }: { hasOther: boolean }) {
  const pathname = usePathname();
  const items = [...navItems(hasOther), { href: "/settings", label: "Settings", icon: Settings }];
  return (
    <nav aria-label="Primary" className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className={cn("grid", items.length === 4 ? "grid-cols-4" : "grid-cols-3")}>
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground",
                  active && "text-amethyst",
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

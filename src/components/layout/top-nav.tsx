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

function navItems() {
  const collections = [COLLECTIONS.anime, COLLECTIONS.games, COLLECTIONS.other];
  return collections.map((collection) => ({ href: `/${collection.slug}`, label: collection.label, icon: COLLECTION_ICONS[collection.slug] }));
}

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

export function TopNav({ displayName }: { displayName: string; hasOther: boolean }) {
  const pathname = usePathname();
  const current = collectionFromPath(pathname);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/anime" className="shrink-0 rounded-md" aria-label="Amethyst Archives home">
          <BrandMark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>

        <nav aria-label="Collections" className="hidden items-center gap-1 md:flex">
          {navItems().map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-link relative rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus-visible:text-foreground",
                  active && "text-foreground",
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
                <DropdownMenuItem asChild>
                  <Link href="/other/new">
                    <Shapes aria-hidden /> Other
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

export function MobileTabBar(_props: { hasOther: boolean }) {
  const pathname = usePathname();
  const items = [...navItems(), { href: "/settings", label: "Settings", icon: Settings }];
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
                  "group/tab flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors active:bg-amethyst/10",
                  active && "text-amethyst",
                )}
              >
                <Icon aria-hidden className="size-5 transition-[scale,translate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active/tab:scale-90 group-aria-[current=page]/tab:-translate-y-0.5" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

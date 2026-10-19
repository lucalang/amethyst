"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem, LibraryBig, LogOut, Settings } from "lucide-react";
import { CollectionActions, NewCategoryButton } from "@/components/categories/collection-actions";
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

        <nav aria-label="Categories" className="hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
          {collections.map((item) => {
            const href = `/${item.id}`;
            const active = isActive(pathname, href);
            return (
              <div key={item.id} className="flex shrink-0 items-center">
              <Link
                href={href}
                title={item.name}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-link relative max-w-48 truncate rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus-visible:text-foreground",
                  active && "text-foreground",
                )}
              >
                {item.name}
              </Link>
              <CollectionActions collection={item} />
              </div>
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
  const items = [...collections.map((collection) => ({ href: `/${collection.id}`, label: collection.name, icon: LibraryBig })), { href: "/settings", label: "Settings", icon: Settings }];
  return (
    <nav aria-label="Primary" className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="flex overflow-x-auto">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="min-w-24 flex-1">
              <Link
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/tab flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-muted-foreground transition-colors active:bg-amethyst/10",
                  active && "text-amethyst",
                )}
              >
                <Icon aria-hidden className="size-5 transition-[scale,translate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] group-active/tab:scale-90 group-aria-[current=page]/tab:-translate-y-0.5" />
                <span className="max-w-28 truncate px-2">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

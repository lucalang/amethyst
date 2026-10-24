"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gem, LibraryBig, LogOut, Megaphone, Settings, UserRound } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { WhatsNewButton } from "@/components/layout/whats-new";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import { cn } from "@/lib/utils";
import { useCurrentCollectionId } from "./current-collection";
import { ProfileAvatar } from "./profile-avatar";

/** Server-rendered collection icons keyed by collection id. */
type CollectionIcons = Record<string, ReactNode>;

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

/** The signed-in account as shown in the private account menu. */
export type AccountSummary = { name: string | null; avatarUrl: string | null; email: string | null };

export function TopNav({ account, collections, icons = {} }: { account: AccountSummary; collections: LibraryCategory[]; icons?: CollectionIcons }) {
  const currentId = useCurrentCollectionId(collections);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 md:gap-6 md:px-6">
        <Link href="/" className="shrink-0 rounded-md" aria-label="Amethyst Archives home">
          <BrandMark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" />
        </Link>

        <nav aria-label="Collections" className="collection-nav-strip hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto border-l border-white/[0.08] py-1 pl-4 md:flex">
          {collections.map((item) => {
            const href = collectionPath(item);
            const active = item.id === currentId;
            const accent = accentStyle(item.accent_color);
            return (
              <Link
                key={item.id}
                href={href}
                title={item.name}
                aria-current={active ? "page" : undefined}
                style={accent}
                className={cn(
                  "nav-link relative flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,border-color] duration-200 outline-none hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-foreground focus-visible:text-foreground",
                  active && (accent ? "border-[var(--ca-line)] bg-[var(--ca-soft)] text-foreground" : "border-amethyst/25 bg-amethyst/10 text-foreground"),
                )}
              >
                <span aria-hidden className={cn("size-3.5 shrink-0", accent ? (active ? "text-[var(--ca)]" : "text-[var(--ca)] opacity-75") : active ? "text-amethyst" : "text-muted-foreground/65")}>
                  {icons[item.id] ?? <LibraryBig className="size-full" />}
                </span>
                <span className="max-w-40 truncate">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {collections.length > 1 ? <ArrangeCollectionsButton collections={collections} compact className="hidden md:inline-flex" /> : null}
          <NewCategoryButton />
          <WhatsNewButton />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu" className="shrink-0">
                <ProfileAvatar name={account.name} src={account.avatarUrl} className="size-7 text-xs" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex items-center gap-2.5">
                <ProfileAvatar name={account.name} src={account.avatarUrl} className="size-8 text-xs" />
                <span className="min-w-0">
                  <span className="block truncate">{account.name ?? "Your account"}</span>
                  {account.email ? <span className="block truncate text-xs font-normal text-muted-foreground">{account.email}</span> : null}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings/profile">
                  <UserRound aria-hidden /> Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/whats-new">
                  <Megaphone aria-hidden /> What’s new
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

export function MobileTabBar({ collections, icons = {} }: { collections: LibraryCategory[]; icons?: CollectionIcons }) {
  const pathname = usePathname();
  const currentId = useCurrentCollectionId(collections);
  const settingsActive = isActive(pathname, "/settings");
  return (
    <nav aria-label="Primary" className="glass fixed inset-x-0 bottom-0 z-40 flex border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="collection-nav-strip flex min-w-0 flex-1 overflow-x-auto px-1">
        {collections.map((collection) => {
          const href = collectionPath(collection);
          const active = collection.id === currentId;
          const accent = accentStyle(collection.accent_color);
          return (
            <li key={collection.id} className="w-24 shrink-0">
              <Link
                href={href}
                title={collection.name}
                aria-current={active ? "page" : undefined}
                style={accent}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium text-muted-foreground transition-colors",
                  accent ? "active:bg-[var(--ca-soft)]" : "active:bg-amethyst/10",
                  active && (accent ? "text-[var(--ca)]" : "text-amethyst"),
                )}
              >
                <span
                  className={cn(
                    "grid h-7 w-11 place-items-center rounded-md transition-colors",
                    accent && !active && "text-[var(--ca)] opacity-80",
                    active && (accent ? "bg-[var(--ca-soft)] ring-1 ring-[var(--ca-line)]" : "bg-amethyst/15 ring-1 ring-amethyst/25"),
                  )}
                >
                  <span aria-hidden className="size-4">{icons[collection.id] ?? <LibraryBig className="size-full" />}</span>
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

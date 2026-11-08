"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IntentLink as Link } from "./intent-link";
import { usePathname } from "next/navigation";
import { Award, Backpack, BookMarked, ChevronLeft, ChevronRight, Clapperboard, Clover, Crown, FlaskConical, Gem, History, Info, KeyRound, LibraryBig, LogIn, LogOut, Megaphone, PackageOpen, Palette, ScrollText, Settings, ShieldCheck, StickyNote, Trophy, UserPlus, UserRound, Wrench, type LucideIcon } from "lucide-react";
import { ArrangeCollectionsButton } from "@/components/categories/arrange-collections";
import { NewCategoryButton } from "@/components/categories/collection-actions";
import { WhatsNewButton } from "@/components/layout/whats-new";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accentStyle } from "@/lib/collection-identity";
import { collectionPath, type LibraryCategory } from "@/lib/collections";
import { DESTINATIONS, destinationFor, type DestinationId } from "@/lib/destinations";
import { cn } from "@/lib/utils";
import { useCurrentCollectionId } from "./current-collection";
import type { AvatarDecorationId } from "@/lib/cosmetics";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileFlair } from "./profile-flair";

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
      <span>Amethyst</span>
    </span>
  );
}

/** The signed-in account as shown in the private account menu. */
export type AccountSummary = {
  name: string | null;
  avatarUrl: string | null;
  decoration: AvatarDecorationId | null;
  email: string | null;
  /** Shows the Admin entry; the admin pages and functions check permission themselves. */
  admin?: boolean;
  /** A guest session: Arcade only. */
  guest?: boolean;
};

type ToolGroup = { id: string; label: string; adminOnly?: boolean; links: { href: string; label: string; icon: LucideIcon }[] };

const TOOL_GROUPS: readonly ToolGroup[] = [
  {
    id: "arcade",
    label: "Arcade",
    links: [
      { href: "/arcade/season", label: "Season Pass", icon: Crown },
      { href: "/arcade/season?tab=quests", label: "Quests", icon: ScrollText },
      { href: "/arcade/leaderboards", label: "Leaderboards", icon: Trophy },
      { href: "/achievements", label: "Achievements", icon: Award },
    ],
  },
  {
    id: "library",
    label: "Library",
    links: [
      { href: "/notes", label: "Quick Notes", icon: StickyNote },
      { href: "/collection-index", label: "Index", icon: BookMarked },
      { href: "/inventory", label: "Inventory", icon: Backpack },
    ],
  },
  {
    id: "shop",
    label: "Shop",
    links: [
      { href: "/shop/cosmetics", label: "Cosmetics", icon: Palette },
      { href: "/shop/cases", label: "Cases", icon: PackageOpen },
      { href: "/shop/boosters", label: "Boosters", icon: Clover },
    ],
  },
  {
    id: "explore",
    label: "Explore",
    links: [
      { href: "/tour", label: "The Tour", icon: Clapperboard },
      { href: "/version-history", label: "Version History", icon: History },
      { href: "/whats-new", label: "What’s New", icon: Megaphone },
    ],
  },
  { id: "utilities", label: "Utilities", links: [{ href: "/lab", label: "The Lab", icon: FlaskConical }, { href: "/vault", label: "The Vault", icon: KeyRound }] },
  { id: "administration", label: "Administration", adminOnly: true, links: [{ href: "/admin", label: "Admin", icon: ShieldCheck }] },
];

/** One-click switcher between the main areas; the current one shows its name. */
function DestinationSwitcher({ current, guest, compact }: { current: DestinationId | null; guest: boolean; compact: boolean }) {
  const items = guest ? DESTINATIONS.filter((item) => item.id === "arcade") : DESTINATIONS;
  return (
    <nav aria-label="Main areas" className="flex items-center gap-0.5 rounded-lg border border-white/[0.06] bg-white/[0.02] p-0.5">
      {items.map(({ id, label, href, icon: Icon }) => {
        const active = id === current;
        return (
          <Link
            key={id}
            href={href}
            title={label}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold text-muted-foreground transition-[color,background-color,scale] duration-150 outline-none select-none hover:bg-white/[0.05] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
              active && "bg-amethyst/15 text-foreground hover:bg-amethyst/20",
            )}
          >
            <Icon aria-hidden className={cn("size-4 shrink-0", active && "text-amethyst")} />
            <span className={cn(active || guest ? "hidden sm:inline" : compact ? "sr-only 2xl:not-sr-only" : "sr-only xl:not-sr-only")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ToolsPanel({ admin, onBack }: { admin: boolean; onBack: () => void }) {
  const baseId = useId();
  const backRef = useRef<HTMLDivElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  return (
    <>
      <DropdownMenuItem
        ref={backRef}
        onSelect={(event) => {
          event.preventDefault();
          onBack();
        }}
        className="font-medium"
      >
        <ChevronLeft aria-hidden /> Tools
        <span className="sr-only">, back to account menu</span>
      </DropdownMenuItem>
      {TOOL_GROUPS.filter((group) => admin || !group.adminOnly).map((group) => (
        <DropdownMenuGroup key={group.id} aria-labelledby={`${baseId}-${group.id}`} className="mt-1">
          <DropdownMenuSeparator />
          <DropdownMenuLabel id={`${baseId}-${group.id}`}>{group.label}</DropdownMenuLabel>
          <div className="grid grid-cols-3 gap-1">
            {group.links.map(({ href, label, icon: Icon }) => (
              <DropdownMenuItem key={href} asChild className="min-h-16 flex-col justify-center gap-1.5 px-1 text-center text-xs focus:[&_svg]:translate-x-0">
                <Link href={href}>
                  <Icon aria-hidden className="size-5" /> {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuGroup>
      ))}
    </>
  );
}

export function TopNav({ account, collections, icons = {} }: { account: AccountSummary; collections: LibraryCategory[]; icons?: CollectionIcons }) {
  const currentId = useCurrentCollectionId(collections);
  const pathname = usePathname();
  const area = destinationFor(pathname);
  const seasonActive = isActive(pathname, "/arcade/season");
  const inArchive = area?.id === "archive";
  const guest = Boolean(account.guest);
  const [menuView, setMenuView] = useState<"main" | "tools">("main");
  const toolsRef = useRef<HTMLDivElement>(null);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-black/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[88rem] items-center gap-3 px-4 md:gap-6 md:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-2 md:gap-3">
          <Link href="/" className="shrink-0 rounded-md" aria-label="Amethyst home">
            <BrandMark className="[&>span:last-child]:hidden lg:[&>span:last-child]:inline" />
          </Link>
          <DestinationSwitcher current={area?.id ?? null} guest={guest} compact={inArchive} />
        </div>

        <nav aria-label="Collections" className={cn("collection-nav-strip hidden min-w-0 flex-1 items-center gap-1 overflow-x-auto border-l border-white/[0.08] py-1 pl-4", inArchive && "md:flex")}>
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
                  "nav-link relative flex h-9 shrink-0 items-center gap-2 rounded-md border border-transparent px-3 text-sm font-medium text-muted-foreground transition-[color,background-color,border-color,scale] duration-200 outline-none select-none hover:border-white/[0.08] hover:bg-white/[0.035] hover:text-foreground focus-visible:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
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
          {collections.length > 1 && inArchive ? <ArrangeCollectionsButton collections={collections} compact className="hidden md:inline-flex" /> : null}
          {inArchive ? <NewCategoryButton /> : null}
          {guest ? null : <Link
            href="/arcade/season"
            aria-label="Season Pass"
            aria-current={seasonActive ? "page" : undefined}
            className={cn(
              "group hidden h-9 shrink-0 items-center gap-1.5 rounded-full border border-amber-300/25 bg-gradient-to-r from-amethyst/15 to-amber-300/10 px-2.5 text-sm font-semibold text-amber-100/90 transition-[color,border-color,background-color,scale] duration-150 outline-none select-none hover:border-amber-300/50 hover:text-amber-50 focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100 sm:flex sm:px-3",
              seasonActive && "border-amber-300/60 from-amethyst/30 to-amber-300/20 text-amber-50",
            )}
          >
            <Crown aria-hidden className="size-4 text-amber-300 transition-transform duration-200 group-hover:-rotate-12 motion-reduce:transition-none" />
            <span aria-hidden className="hidden sm:inline">Season Pass</span>
          </Link>}
          <WhatsNewButton />

          <DropdownMenu onOpenChange={(open) => open && setMenuView("main")}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Account menu" className="shrink-0">
                <ProfileAvatar name={account.name} src={account.avatarUrl} decoration={account.decoration} className="size-7 text-xs" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={menuView === "tools" ? "w-80 max-w-[calc(100vw-1rem)]" : "w-60"}>
              {guest ? (
                <>
                  <DropdownMenuLabel>
                    <span className="block">Guest</span>
                    <span className="block text-xs font-normal text-muted-foreground">Arcade only, no account</span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/register">
                      <UserPlus aria-hidden /> Create account
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/login">
                      <LogIn aria-hidden /> Sign in
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/guest">
                      <Info aria-hidden /> What guests can do
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <form action="/auth/signout" method="post">
                    <DropdownMenuItem asChild>
                      <button type="submit" className="w-full">
                        <LogOut aria-hidden /> End guest session
                      </button>
                    </DropdownMenuItem>
                  </form>
                  <p className="px-2 pb-1 text-[11px] text-muted-foreground">Ending it discards guest coins and scores.</p>
                </>
              ) : menuView === "tools" ? (
                <ToolsPanel
                  admin={Boolean(account.admin)}
                  onBack={() => {
                    setMenuView("main");
                    requestAnimationFrame(() => toolsRef.current?.focus());
                  }}
                />
              ) : (
              <>
              <DropdownMenuLabel className="flex items-center gap-2.5">
                <ProfileAvatar name={account.name} src={account.avatarUrl} decoration={account.decoration} className="size-8 text-xs" />
                <span className="min-w-0">
                  <span className="block truncate">{account.name ?? "Your account"}</span>
                  <ProfileFlair maxVisible={3} className="my-0.5 [--flair-size:11px]" />
                  {account.email ? <span className="block truncate text-xs font-normal text-muted-foreground">{account.email}</span> : null}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserRound aria-hidden /> My Profile
                </Link>
              </DropdownMenuItem>
              {DESTINATIONS.filter((d) => d.id !== "shop").map(({ id, href, label, icon: Icon }) => (
                <DropdownMenuItem key={id} asChild>
                  <Link href={href}>
                    <Icon aria-hidden /> {label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings aria-hidden /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                ref={toolsRef}
                onSelect={(event) => {
                  event.preventDefault();
                  setMenuView("tools");
                }}
              >
                <Wrench aria-hidden /> Tools
                <ChevronRight aria-hidden className="ml-auto" />
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <form action="/auth/signout" method="post">
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full">
                    <LogOut aria-hidden /> Sign out
                  </button>
                </DropdownMenuItem>
              </form>
              </>
              )}
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
  // Collection tabs belong to the Archive; other areas have their own navigation (or none).
  if (destinationFor(pathname)?.id !== "archive") return null;
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

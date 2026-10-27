"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Frame, Keyboard, LayoutTemplate, LibraryBig, Palette, PenLine, SlidersHorizontal, Sparkles, Tags, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: LucideIcon; active: (pathname: string) => boolean };

const ITEMS: Item[] = [
  {
    href: "/settings",
    label: "General",
    icon: SlidersHorizontal,
    active: (pathname) => pathname === "/settings" || pathname.startsWith("/settings/password"),
  },
  {
    href: "/customization/profile",
    label: "Profile",
    icon: UserRound,
    active: (pathname) => pathname.startsWith("/customization/profile"),
  },
  {
    href: "/customization/themes",
    label: "Themes",
    icon: Palette,
    active: (pathname) => pathname.startsWith("/customization/themes"),
  },
  {
    href: "/customization/frames",
    label: "Artwork frames",
    icon: Frame,
    active: (pathname) => pathname.startsWith("/customization/frames"),
  },
  {
    href: "/customization/appearance",
    label: "Appearance",
    icon: Sparkles,
    active: (pathname) => pathname.startsWith("/customization/appearance"),
  },
  {
    href: "/settings/editor",
    label: "Editor",
    icon: PenLine,
    active: (pathname) => pathname.startsWith("/settings/editor"),
  },
  {
    href: "/settings/shortcuts",
    label: "Shortcuts",
    icon: Keyboard,
    active: (pathname) => pathname.startsWith("/settings/shortcuts"),
  },
  {
    href: "/settings/collections",
    label: "Collections",
    icon: LibraryBig,
    active: (pathname) => pathname.startsWith("/settings/collections"),
  },
  {
    href: "/settings/templates",
    label: "Templates",
    icon: LayoutTemplate,
    active: (pathname) => pathname.startsWith("/settings/templates"),
  },
  {
    href: "/settings/labels",
    label: "Labels",
    icon: Tags,
    active: (pathname) => pathname.startsWith("/settings/labels"),
  },
];

/** Section navigation: a sidebar on wide screens, a sticky segmented strip on small ones. */
export function SettingsNav({ area = "settings" }: { area?: "settings" | "customization" }) {
  const pathname = usePathname();
  const title = area === "settings" ? "Settings" : "Customization";
  const items = ITEMS.filter((item) => item.href.startsWith(`/${area}`));
  return (
    <nav
      aria-label={`${title} sections`}
      className="enter sticky top-14 z-20 -mx-4 border-b border-white/[0.07] bg-background/95 px-4 py-2 backdrop-blur-md md:top-24 md:mx-0 md:self-start md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
    >
      <p className="mb-3 hidden px-3 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground/70 uppercase md:block">{title}</p>
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-1 md:overflow-visible md:px-0">
        {items.map((item) => {
          const active = item.active(pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0 md:min-w-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group/settings-nav relative flex min-h-10 items-center justify-center gap-2 rounded-md border border-transparent px-2 text-sm font-medium text-muted-foreground transition-[color,background-color,border-color] outline-none hover:bg-white/[0.035] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:min-h-12 md:justify-start md:gap-3 md:px-3",
                  active && "border-amethyst/25 bg-amethyst/10 text-foreground hover:bg-amethyst/[0.12]",
                )}
              >
                {active ? <span aria-hidden className="absolute top-2 bottom-2 -left-px hidden w-0.5 rounded-full bg-amethyst shadow-[0_0_10px_rgb(var(--accent-rgb)/0.8)] md:block" /> : null}
                <Icon aria-hidden className={cn("size-4 shrink-0 transition-colors", active ? "text-amethyst" : "text-muted-foreground/70 group-hover/settings-nav:text-amethyst")} />
                <span className="min-w-0">
                  <span className="block truncate">{item.label}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

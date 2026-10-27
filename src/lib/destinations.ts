import { Gamepad2, LibraryBig, ListChecks, type LucideIcon } from "lucide-react";

export type DestinationId = "archive" | "todo" | "arcade";

/** The app's main areas: Home links to each, and the top bar shows the one you're in. */
export type Destination = {
  id: DestinationId;
  label: string;
  tagline: string;
  href: string;
  icon: LucideIcon;
  /** Pathname prefixes that belong to the destination. */
  prefixes: string[];
};

export const DESTINATIONS: Destination[] = [
  {
    id: "archive",
    label: "Archive",
    tagline: "Collections, entries and their workspaces",
    href: "/collections",
    icon: LibraryBig,
    prefixes: ["/collections", "/entries", "/franchise"],
  },
  {
    id: "todo",
    label: "To Do",
    tagline: "My Day, your lists and what's planned",
    href: "/tasks",
    icon: ListChecks,
    prefixes: ["/tasks"],
  },
  {
    id: "arcade",
    label: "Arcade",
    tagline: "Quick games, coins and the prize shop",
    href: "/arcade",
    icon: Gamepad2,
    prefixes: ["/arcade"],
  },
];

export function destinationFor(pathname: string): Destination | null {
  return DESTINATIONS.find((destination) => destination.prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) ?? null;
}

export function destination(id: DestinationId): Destination {
  return DESTINATIONS.find((item) => item.id === id)!;
}

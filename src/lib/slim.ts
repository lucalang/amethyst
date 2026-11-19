/**
 * Slim Amethyst: a mode of the normal app (the `slimMode` setting) that hides a few feature-heavy areas. It only
 * changes what the interface offers. Data, cosmetics, permissions and every other setting stay exactly as they
 * are, and turning it off brings everything back.
 *
 * The display name lives here and nowhere else, so it can be renamed in one line.
 */
export const SLIM_NAME = "Slim Amethyst";

/** The areas Slim hides, by the paths they live under. */
export const SLIM_HIDDEN_AREAS = [
  // The Arcade includes its Season Pass, Quests, Leaderboards, Tournaments and Wagers.
  { id: "arcade", label: "Arcade", paths: ["/arcade"] },
  { id: "season-pass", label: "Season Pass & Quests", paths: ["/arcade/season"] },
  { id: "shop", label: "Shop", paths: ["/shop"] },
  { id: "vault", label: "The Vault", paths: ["/vault"] },
  { id: "lab", label: "The Lab", paths: ["/lab"] },
  { id: "admin-dashboard", label: "Admin Dashboard", paths: ["/admin-dashboard"] },
  { id: "code-admin", label: "Code Admin", paths: ["/admin"] },
  { id: "version-history", label: "Version History", paths: ["/version-history"] },
  { id: "time-machine", label: "Timeline", paths: ["/time-machine"] },
  // Inventory also holds case opening; the Shop's cases are hidden with the Shop.
  { id: "inventory", label: "Inventory", paths: ["/inventory"] },
  { id: "collection-index", label: "Index", paths: ["/collection-index"] },
  { id: "achievements", label: "Achievements", paths: ["/achievements"] },
  { id: "tour", label: "The Tour", paths: ["/tour"] },
] as const;

export type SlimArea = (typeof SLIM_HIDDEN_AREAS)[number];

/** The hidden area an address belongs to (whole path segments only: /admin is not /admin-dashboard), or null. */
export function slimAreaOf(href: string): SlimArea | null {
  const path = href.split(/[?#]/)[0];
  return SLIM_HIDDEN_AREAS.find((area) => area.paths.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) ?? null;
}

/** Whether Slim hides this link. */
export const slimHides = (href: string) => slimAreaOf(href) !== null;

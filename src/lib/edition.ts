/**
 * App editions. Full Amethyst is the whole app; the Slim edition is a lighter shell over the same account and data
 * that keeps only the archive (collections, entries and their workspaces). Editions are only a choice of interface:
 * authentication, authorization and data are the same in both.
 *
 * The Slim edition's display name lives here and nowhere else, so it can be renamed in one line.
 */
export const SLIM_NAME = "Slim Amethyst";
export const FULL_NAME = "Full Amethyst";

/** Where the Slim edition lives. Its archive pages mirror the Full ones under this prefix. */
export const SLIM_BASE = "/slim";

export type Edition = "full" | "slim";

/** Full paths that have a Slim counterpart (everything else falls back to Slim Home). */
const MIRRORED = [/^\/collections\/[^/]+(\/new)?$/, /^\/entries\/[^/]+$/];

/** The Slim page for a Full page, or Slim Home when the Slim edition has no such page. */
export function slimPathFor(fullPath: string) {
  const path = fullPath.split(/[?#]/)[0];
  return MIRRORED.some((pattern) => pattern.test(path)) ? `${SLIM_BASE}${fullPath}` : SLIM_BASE;
}

/** The Full page for a Slim page (Slim Home and Search open the Full archive). */
export function fullPathFor(slimPath: string) {
  const rest = slimPath.startsWith(SLIM_BASE) ? slimPath.slice(SLIM_BASE.length) : slimPath;
  if (rest === "" || rest === "/" || rest.startsWith("/search")) return "/collections";
  return rest;
}

export const isSlimPath = (path: string) => path === SLIM_BASE || path.startsWith(`${SLIM_BASE}/`);

/** Guest sessions (anonymous sign-ins) may only use the Arcade; everything else belongs to an account. */
export const GUEST_HOME = "/arcade";
export const GUEST_INFO = "/guest";

// Arcade pages that spend or track account progress.
const ACCOUNT_ARCADE_PAGES = new Set(["season", "tournaments", "wagers"]);
const GUEST_APIS = ["/api/arcade", "/api/preferences"];

export function guestMayOpen(pathname: string) {
  if (pathname === GUEST_HOME || pathname === GUEST_INFO) return true;
  const page = /^\/arcade\/([^/]+)$/.exec(pathname)?.[1];
  return Boolean(page && !ACCOUNT_ARCADE_PAGES.has(page));
}

export function guestMayCall(pathname: string) {
  return GUEST_APIS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

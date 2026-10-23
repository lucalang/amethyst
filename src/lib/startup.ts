/** Session cookie marking that this browser session already opened the app, so later visits to Home stay on Home. */
export const STARTUP_COOKIE = "archive-started";
export const STARTUP_PATH = "/start";

export const startupCookieOptions = (secure: boolean) => ({ path: "/", httpOnly: true, sameSite: "lax" as const, secure });

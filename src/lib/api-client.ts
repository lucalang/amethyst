export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** Same-origin JSON fetch used by client components; throws ApiError on failure. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError("Could not reach Amethyst. Check your connection and try again.", 0, "network_error");
  }
  let body: unknown;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError("The server response could not be read. Reload to check whether your changes were saved before trying again.", response.status, "invalid_response");
  }
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string; details?: { path?: unknown[] }[] } } | null)?.error;
    const path = Array.isArray(error?.details) ? error.details[0]?.path?.[0] : undefined;
    const fallback = response.status === 401
      ? "Your session has expired. Sign in again to continue."
      : response.status >= 500
        ? "Amethyst could not save your changes. Try again in a moment."
        : "This request could not be completed. Reload and try again.";
    throw new ApiError(error?.message ?? fallback, response.status, error?.code, typeof path === "string" ? path : undefined);
  }
  const achievementUnlocks = (body as { achievementUnlocks?: unknown } | null)?.achievementUnlocks;
  if (typeof window !== "undefined" && Array.isArray(achievementUnlocks) && achievementUnlocks.length) {
    window.dispatchEvent(new CustomEvent("archive:achievement-unlocked", { detail: achievementUnlocks }));
  }
  return body as T;
}

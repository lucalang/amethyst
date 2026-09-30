// Runtime-agnostic HTTP helpers (Node, Next.js and the Deno worker).

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class RateLimitedError extends ProviderError {
  constructor(
    provider: string,
    readonly retryAfterMs: number,
  ) {
    super(`${provider} rate limit: retry after ${Math.ceil(retryAfterMs / 1000)}s`, provider, 429, true);
    this.name = "RateLimitedError";
  }
}

/** Shared request pacing. `acquire` waits for a slot; `block` records Retry-After. */
export type Throttle = {
  acquire(): Promise<void>;
  block(retryAfterMs: number): Promise<void>;
};

export type HttpDeps = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  throttle?: Throttle;
  now?: () => number;
};

export type RetryOptions = {
  provider: string;
  maxRetries?: number;
  /** Retry-After waits longer than this are surfaced as RateLimitedError. */
  maxInlineWaitMs?: number;
  timeoutMs?: number;
};

export function parseRetryAfter(value: string | null, now: number = Date.now()): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.round(Number(trimmed) * 1000);
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export function backoffMs(attempt: number, baseMs = 1000, capMs = 30_000): number {
  return Math.min(capMs, baseMs * 2 ** attempt);
}

export const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Fetch with bounded retries: 429/503 honour Retry-After (short waits inline,
 * long waits bubble up so a durable job can be rescheduled), 5xx and network
 * errors use exponential backoff. Other statuses are returned to the caller.
 */
export async function requestWithRetry(url: string, init: RequestInit, deps: HttpDeps, options: RetryOptions): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const maxInlineWaitMs = options.maxInlineWaitMs ?? 15_000;
  const now = deps.now ?? Date.now;

  for (let attempt = 0; ; attempt++) {
    await deps.throttle?.acquire();
    let response: Response;
    try {
      response = await deps.fetch(url, { ...init, signal: AbortSignal.timeout(options.timeoutMs ?? 20_000) });
    } catch {
      if (attempt >= maxRetries) {
        throw new ProviderError(`${options.provider} request failed (network)`, options.provider, null, true);
      }
      await deps.sleep(backoffMs(attempt));
      continue;
    }

    if (response.status === 429 || (response.status === 503 && response.headers.has("retry-after"))) {
      const retryAfter = parseRetryAfter(response.headers.get("retry-after"), now()) ?? backoffMs(attempt, 2000);
      await response.body?.cancel().catch(() => undefined);
      await deps.throttle?.block(retryAfter);
      if (attempt >= maxRetries || retryAfter > maxInlineWaitMs) {
        throw new RateLimitedError(options.provider, retryAfter);
      }
      await deps.sleep(retryAfter);
      continue;
    }

    if (response.status >= 500) {
      await response.body?.cancel().catch(() => undefined);
      if (attempt >= maxRetries) {
        throw new ProviderError(`${options.provider} responded ${response.status}`, options.provider, response.status, true);
      }
      await deps.sleep(backoffMs(attempt));
      continue;
    }

    return response;
  }
}

/** Minimal in-process throttle (used by the Next.js server for catalog search). */
export function createLocalThrottle(intervalMs: number, sleep = realSleep, now: () => number = Date.now): Throttle {
  let nextSlot = 0;
  return {
    async acquire() {
      const current = now();
      const slot = Math.max(nextSlot, current);
      nextSlot = slot + intervalMs;
      if (slot > current) await sleep(slot - current);
    },
    async block(retryAfterMs) {
      nextSlot = Math.max(nextSlot, now() + retryAfterMs);
    },
  };
}

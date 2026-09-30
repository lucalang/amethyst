export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** Same-origin JSON fetch used by client components; throws ApiError on failure. */
export async function apiFetch<T = unknown>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const response = await fetch(url, {
    ...rest,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const error = (body as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(error?.message ?? `Request failed (${response.status})`, response.status, error?.code);
  }
  return body as T;
}

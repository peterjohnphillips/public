/**
 * Thin fetch wrapper. Relative /api paths only, so Vite's dev proxy (and any
 * later reverse proxy) works without touching this code.
 */

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, body: unknown) {
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : `HTTP ${status}`;
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Any plain object of primitive-ish values is an acceptable query param bag.
 * The *Filters interfaces across api/*.ts extend this (via `extends
 * QueryParams`) so they carry its index signature and satisfy this type
 * without needing to repeat one themselves. */
export type QueryParams = Record<string, string | number | boolean | undefined | null>;

async function request<T>(
  path: string,
  init?: RequestInit & { params?: QueryParams },
): Promise<T> {
  const { params, ...rest } = init ?? {};
  const url = new URL(`/api${path}`, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...rest.headers,
    },
  });

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Non-JSON error body (e.g. the backend is not running at all).
    }
    throw new ApiError(response.status, body);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: QueryParams) => request<T>(path, { method: "GET", params }),

  post: <T>(path: string, body?: unknown, params?: QueryParams) =>
    request<T>(path, {
      method: "POST",
      params,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
};

/** True once a request has succeeded at least once this session. Cheap "is the
 * backend up" signal for the header banner, without a dedicated poller. */
export let backendReachable = true;

export function markBackendUnreachable() {
  backendReachable = false;
}

export function markBackendReachable() {
  backendReachable = true;
}

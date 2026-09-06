/**
 * API layer. The single-file GitHub Pages build has no server, so requests are
 * served in-process by local/backend.ts against browser storage. The public
 * shape (`api.get/post/put`, `ApiError`) is unchanged, so nothing else in the
 * app knows the difference.
 */

import { LocalApiError, localRequest } from "../local/backend";

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
  const { params, method = "GET", body } = init ?? {};
  const parsedBody = typeof body === "string" ? JSON.parse(body) : undefined;

  try {
    return await localRequest<T>(method, path, params, parsedBody);
  } catch (error) {
    if (error instanceof LocalApiError) {
      throw new ApiError(error.status, error.body);
    }
    throw error;
  }
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

import { getToken } from "@/stores/auth-store";

export interface DevBoardHeaders {
  colo: string;
  durationMs: number | null;
}

export interface ApiFetchOptions extends RequestInit {
  // Register/login must never send a stale or foreign bearer token.
  skipAuth?: boolean;
}

type Listener = (headers: DevBoardHeaders) => void;

let lastHeaders: DevBoardHeaders = { colo: "LOCAL", durationMs: null };
const listeners = new Set<Listener>();

function notify(headers: DevBoardHeaders): void {
  lastHeaders = headers;
  for (const listener of listeners) listener(headers);
}

export function getLastHeaders(): DevBoardHeaders {
  return lastHeaders;
}

export function subscribeHeaders(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
  const { skipAuth, headers, ...rest } = init ?? {};
  const token = skipAuth ? null : getToken();
  const res = await fetch(path, {
    ...rest,
    headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
  });

  notify({
    colo: res.headers.get("X-DevBoard-Colo") ?? "LOCAL",
    durationMs: res.headers.get("X-DevBoard-Duration") ? Number(res.headers.get("X-DevBoard-Duration")) : null,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const error = new Error(body?.error?.message ?? `Request failed: ${res.status}`) as Error & {
      code?: string;
      details?: unknown;
    };
    error.code = body?.error?.code ?? "UNKNOWN";
    error.details = body?.error?.details;
    throw error;
  }

  return res.json() as Promise<T>;
}

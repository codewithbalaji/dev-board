export interface DevBoardHeaders {
  colo: string;
  durationMs: number | null;
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

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);

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

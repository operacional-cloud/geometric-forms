// Cliente HTTP pras Route Handlers internas (mesma origem).
// Cookies de autenticação viajam automaticamente — sem necessidade de Authorization header.

export const API_BASE = ''; // relativo (mesma origem)

export async function apiFetch<T = any>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: any;
    /** @deprecated mantido pra compat; ignorado (auth vem por cookie) */
    token?: string | null;
    cache?: RequestCache;
  } = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache || 'no-store',
    credentials: 'include', // garante envio de cookies em cross-origin (no-op same-origin)
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || `HTTP ${res.status}`;
    const err = new Error(msg) as any;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }
  return json as T;
}

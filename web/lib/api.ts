// Helper para chamar a API backend (Express na porta 3000) com JWT do Supabase.

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3000';

export async function apiFetch<T = any>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    token?: string | null;
    cache?: RequestCache;
  } = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: opts.cache || 'no-store',
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

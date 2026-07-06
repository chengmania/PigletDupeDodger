export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | null;
}

export async function postJson<T = unknown>(path: string, payload: unknown): Promise<ApiResult<T>> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    credentials: 'same-origin',
  });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export async function getJson<T = unknown>(path: string): Promise<ApiResult<T>> {
  const res = await fetch(path, { credentials: 'same-origin' });
  let body: T | null = null;
  try {
    body = (await res.json()) as T;
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

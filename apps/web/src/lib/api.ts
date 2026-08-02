const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';
export const token = () =>
  typeof window === 'undefined' ? '' : (localStorage.getItem('accessToken') ?? '');
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${token()}`,
      ...init.headers,
    },
  });
  if (response.status === 401 && typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    window.location.href = '/login';
  }
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
export { base };

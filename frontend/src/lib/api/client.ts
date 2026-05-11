const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5022";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (res.status === 404) {
    return [] as unknown as T;
  }

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  if (res.status === 204 || res.headers.get("content-length") === "0") {
    return null as unknown as T;
  }

  return res.json();
}

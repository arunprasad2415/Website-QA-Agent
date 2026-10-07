export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ApiError(
      body?.message ?? `Request failed with status ${res.status}`,
      res.status
    )
  }
  return body as T
}

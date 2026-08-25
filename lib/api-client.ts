import { MESSAGES } from "@/lib/errors";
import type { ApiErrorBody } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, "network", MESSAGES.network);
  }

  if (res.status === 401) {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`,
    );
    window.location.href = `/login?next=${next}`;
    throw new ApiError(401, "unauthorized", MESSAGES.unauthorized);
  }

  if (!res.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    throw new ApiError(
      res.status,
      body?.error ?? "drive",
      body?.message ?? MESSAGES.drive,
    );
  }

  return (await res.json()) as T;
}

export function userMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  return MESSAGES.drive;
}

"use client";

import { apiFetch } from "@/lib/api-client";
import type { AlbumsResponse, MediaListResponse } from "@/lib/types";

type Entry = { at: number; data: unknown };

const memory = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000;

export const CACHE_ALBUMS = "albums";

export function libraryCacheKey(opts: {
  albumId?: string;
  type?: string;
  collection?: string;
  filter?: string;
}) {
  if (opts.albumId) return `album:${opts.albumId}:${opts.filter ?? "all"}`;
  return `library:${opts.type ?? "all"}:${opts.collection ?? "all"}`;
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = memory.get(key);
  if (!entry) return undefined;
  return entry.data as T;
}

export function cacheIsFresh(key: string) {
  const entry = memory.get(key);
  return Boolean(entry && Date.now() - entry.at < TTL_MS);
}

export function cacheSet<T>(key: string, data: T) {
  memory.set(key, { at: Date.now(), data });
}

export function cacheClear() {
  memory.clear();
}

export async function prefetchLibrary() {
  const jobs = [
    {
      key: libraryCacheKey({ type: "image" }),
      url: "/api/library/media?type=image",
    },
    {
      key: libraryCacheKey({ type: "video" }),
      url: "/api/library/media?type=video",
    },
  ];

  await Promise.all(
    jobs.map(async (job) => {
      if (cacheIsFresh(job.key)) return;
      try {
        const data = await apiFetch<MediaListResponse>(job.url);
        cacheSet(job.key, data);
      } catch {
        /* prefetch should never block the UI */
      }
    }),
  );
}

export function cachedAlbums() {
  return cacheGet<AlbumsResponse>(CACHE_ALBUMS)?.albums;
}

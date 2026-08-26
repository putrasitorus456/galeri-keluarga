"use client";

import { apiFetch } from "@/lib/api-client";
import type { AlbumsResponse, MediaItem, MediaListResponse, MediaMetaResponse } from "@/lib/types";

type Entry = { at: number; data: unknown };

const memory = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000;
const MEDIA_PREFIX = "media:";
const MAX_PREVIEW_ITEMS = 24;
const MAX_PREVIEW_BYTES = 80 * 1024 * 1024;

type PreviewEntry = {
  objectUrl: string;
  bytes: number;
};

const previewMemory = new Map<string, PreviewEntry>();
const previewPending = new Map<string, Promise<string>>();
const openedIds = new Set<string>();
const transcodedIds = new Set<string>();

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

function mediaKey(id: string) {
  return `${MEDIA_PREFIX}${id}`;
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
  indexMediaList(data);
}

export function cacheMedia(item: MediaItem, albumId?: string) {
  memory.set(mediaKey(item.id), {
    at: Date.now(),
    data: {
      albumId: albumId ?? item.albumId ?? "",
      media: item,
    } satisfies MediaMetaResponse,
  });
}

export function cacheMediaList(items: MediaItem[], albumId?: string) {
  for (const item of items) {
    if (item?.id) cacheMedia(item, albumId ?? item.albumId);
  }
}

export function getCachedMedia(id: string) {
  return cacheGet<MediaMetaResponse>(mediaKey(id));
}

function indexMediaList(data: unknown) {
  if (!data || typeof data !== "object" || !("items" in data)) return;
  const items = (data as MediaListResponse).items;
  if (!Array.isArray(items)) return;
  cacheMediaList(items);
}

export function markMediaOpened(id: string) {
  openedIds.add(id);
}

export function wasMediaOpened(id: string) {
  return openedIds.has(id);
}

export function markVideoNeedsTranscode(id: string) {
  transcodedIds.add(id);
}

export function videoNeedsTranscode(id: string) {
  return transcodedIds.has(id);
}

export function getCachedPreviewUrl(id: string) {
  const entry = previewMemory.get(id);
  if (!entry) return undefined;
  previewMemory.delete(id);
  previewMemory.set(id, entry);
  return entry.objectUrl;
}

function evictPreviews(incomingBytes: number) {
  while (previewMemory.size >= MAX_PREVIEW_ITEMS) {
    const oldest = previewMemory.keys().next().value;
    if (!oldest) break;
    revokePreview(oldest);
  }

  let used = 0;
  for (const entry of previewMemory.values()) used += entry.bytes;
  while (used + incomingBytes > MAX_PREVIEW_BYTES && previewMemory.size > 0) {
    const oldest = previewMemory.keys().next().value;
    if (!oldest) break;
    used -= previewMemory.get(oldest)?.bytes ?? 0;
    revokePreview(oldest);
  }
}

function revokePreview(id: string) {
  const entry = previewMemory.get(id);
  if (!entry) return;
  URL.revokeObjectURL(entry.objectUrl);
  previewMemory.delete(id);
}

export async function rememberPreview(id: string, src: string) {
  const existing = getCachedPreviewUrl(id);
  if (existing) return existing;

  const inflight = previewPending.get(id);
  if (inflight) return inflight;

  const job = (async () => {
    const res = await fetch(src, {
      credentials: "include",
      cache: "force-cache",
    });
    if (!res.ok) {
      throw new Error("preview");
    }
    const blob = await res.blob();
    const cached = getCachedPreviewUrl(id);
    if (cached) return cached;
    evictPreviews(blob.size);
    const objectUrl = URL.createObjectURL(blob);
    previewMemory.set(id, { objectUrl, bytes: blob.size });
    return objectUrl;
  })().finally(() => {
    previewPending.delete(id);
  });

  previewPending.set(id, job);
  return job;
}

export function cacheClear() {
  for (const id of previewMemory.keys()) revokePreview(id);
  previewPending.clear();
  openedIds.clear();
  transcodedIds.clear();
  memory.clear();
  if (typeof caches !== "undefined") {
    void caches.delete("gallery-media-files");
  }
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

export function findCachedAlbumList(albumId: string, mediaId?: string) {
  const filters = ["all", "image", "video"] as const;
  let fallback:
    | (MediaListResponse & { filter: (typeof filters)[number] })
    | undefined;
  for (const filter of filters) {
    const data = cacheGet<MediaListResponse>(libraryCacheKey({ albumId, filter }));
    if (!data?.items?.length) continue;
    const found = { ...data, filter };
    if (mediaId && data.items.some((item) => item.id === mediaId)) return found;
    fallback ??= found;
  }
  return fallback;
}

export function appendCachedAlbumItems(
  albumId: string,
  page: MediaListResponse,
  filter: "all" | "image" | "video" = "all",
) {
  const key = libraryCacheKey({ albumId, filter });
  const existing = cacheGet<MediaListResponse>(key);
  const seen = new Set(existing?.items.map((item) => item.id) ?? []);
  const merged = [
    ...(existing?.items ?? []),
    ...page.items.filter((item) => !seen.has(item.id)),
  ];
  const next: MediaListResponse = {
    album: page.album ?? existing?.album,
    items: merged,
    nextPageToken: page.nextPageToken,
    total: page.total ?? existing?.total,
  };
  cacheSet(key, next);
  return next;
}

export function cachedAlbums() {
  return cacheGet<AlbumsResponse>(CACHE_ALBUMS)?.albums;
}

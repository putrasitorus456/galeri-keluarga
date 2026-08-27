"use client";

import { apiFetch } from "@/lib/api-client";
import type {
  AlbumsResponse,
  MediaItem,
  MediaListResponse,
  MediaMetaResponse,
} from "@/lib/types";

type Entry = { at: number; data: unknown };

const memory = new Map<string, Entry>();
const TTL_MS = 5 * 60 * 1000;
const MEDIA_PREFIX = "media:";
const STORE_PREFIX = "gk-cache:";
const MAX_PREVIEW_ITEMS = 24;
const MAX_PREVIEW_BYTES = 80 * 1024 * 1024;
const TRANSCODE_STORE = "gk-transcode-ids";

type PreviewEntry = {
  objectUrl: string;
  bytes: number;
};

const previewMemory = new Map<string, PreviewEntry>();
const previewPending = new Map<string, Promise<string>>();
const openedIds = new Set<string>();
const prefetching = new Set<string>();

export const CACHE_ALBUMS = "albums";

function readTranscodedIds() {
  if (typeof sessionStorage === "undefined") return new Set<string>();
  try {
    const raw = sessionStorage.getItem(TRANSCODE_STORE);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set<string>();
  }
}

const transcodedIds = readTranscodedIds();

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

function shouldPersist(key: string) {
  return (
    key === CACHE_ALBUMS ||
    key.startsWith("album:") ||
    key.startsWith("library:")
  );
}

function persist(key: string, entry: Entry) {
  if (typeof sessionStorage === "undefined" || !shouldPersist(key)) return;
  try {
    sessionStorage.setItem(STORE_PREFIX + key, JSON.stringify(entry));
  } catch {
    /* quota — memory cache still works */
  }
}

function readPersisted(key: string): Entry | undefined {
  if (typeof sessionStorage === "undefined" || !shouldPersist(key)) {
    return undefined;
  }
  try {
    const raw = sessionStorage.getItem(STORE_PREFIX + key);
    if (!raw) return undefined;
    const entry = JSON.parse(raw) as Entry;
    if (!entry || typeof entry !== "object" || !("data" in entry)) {
      return undefined;
    }
    return entry;
  } catch {
    return undefined;
  }
}

export function cacheGet<T>(key: string): T | undefined {
  const mem = memory.get(key);
  if (mem) return mem.data as T;
  const stored = readPersisted(key);
  if (!stored) return undefined;
  memory.set(key, stored);
  indexMediaList(stored.data);
  return stored.data as T;
}

export function cacheIsFresh(key: string) {
  const entry = memory.get(key) ?? readPersisted(key);
  return Boolean(entry && Date.now() - entry.at < TTL_MS);
}

export function cacheSet<T>(key: string, data: T) {
  const entry = { at: Date.now(), data };
  memory.set(key, entry);
  indexMediaList(data);
  persist(key, entry);
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
  try {
    sessionStorage.setItem(TRANSCODE_STORE, JSON.stringify([...transcodedIds]));
  } catch {
    /* quota — memory set still works */
  }
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

export function warmMedia(item: MediaItem) {
  if (item.type === "image") {
    void rememberPreview(item.id, item.previewUrl);
  }
}

export function cacheClear() {
  for (const id of previewMemory.keys()) revokePreview(id);
  previewPending.clear();
  openedIds.clear();
  transcodedIds.clear();
  prefetching.clear();
  memory.clear();
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.removeItem(TRANSCODE_STORE);
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORE_PREFIX)) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  }
  if (typeof caches !== "undefined") {
    void caches.delete("gallery-media-files");
  }
}

export async function prefetchLibrary() {
  await Promise.all([
    prefetchLibraryView({ type: "image" }),
    prefetchLibraryView({ type: "video" }),
  ]);
}

export async function prefetchAlbum(albumId: string) {
  const key = libraryCacheKey({ albumId, filter: "all" });
  if (cacheGet(key) || prefetching.has(key)) return;
  prefetching.add(key);
  try {
    const data = await apiFetch<MediaListResponse>(`/api/albums/${albumId}/media`);
    cacheSet(key, data);
  } catch {
    /* hover prefetch is best-effort */
  } finally {
    prefetching.delete(key);
  }
}

export async function prefetchLibraryView(opts: {
  type?: string;
  collection?: string;
}) {
  const key = libraryCacheKey(opts);
  if (cacheGet(key) || prefetching.has(key)) return;
  prefetching.add(key);
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.collection) params.set("collection", opts.collection);
  const query = params.toString();
  try {
    const data = await apiFetch<MediaListResponse>(
      `/api/library/media${query ? `?${query}` : ""}`,
    );
    cacheSet(key, data);
  } catch {
    /* hover prefetch is best-effort */
  } finally {
    prefetching.delete(key);
  }
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

export function hasCachedPath(path: string) {
  if (path === "/" || path === "/albums") return Boolean(cachedAlbums());
  const albumMedia = path.match(/^\/album\/([^/]+)(?:\/([^/]+))?$/);
  if (albumMedia) {
    const [, albumId, mediaId] = albumMedia;
    if (mediaId) {
      return Boolean(
        getCachedMedia(mediaId) || findCachedAlbumList(albumId, mediaId),
      );
    }
    return Boolean(cacheGet(libraryCacheKey({ albumId, filter: "all" })));
  }
  const tipe = path.match(/^\/tipe\/(foto|video|gif|terbaru)(?:\/([^/]+))?$/);
  if (tipe) {
    const [, kind, mediaId] = tipe;
    if (mediaId) return Boolean(getCachedMedia(mediaId));
    const type =
      kind === "foto" ? "image" : kind === "video" ? "video" : kind === "gif" ? "gif" : undefined;
    return Boolean(cacheGet(libraryCacheKey({ type })));
  }
  const koleksi = path.match(/^\/koleksi\/([^/]+)(?:\/([^/]+))?$/);
  if (koleksi) {
    const [, slug, mediaId] = koleksi;
    if (mediaId) return Boolean(getCachedMedia(mediaId));
    return Boolean(cacheGet(libraryCacheKey({ collection: slug })));
  }
  return false;
}

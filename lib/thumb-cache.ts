import {
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { ensureDir, envMb, resolveCacheDir } from "@/lib/cache-dir";

// Bump when on-disk layout changes.
const CACHE_VERSION = "v2";
const CACHE_BUDGET_BYTES = envMb("THUMB_CACHE_MAX_MB", 1024);
const META_SUFFIX = ".meta";
const MEMORY_MAX_ITEMS = 240;
const MEMORY_MAX_BYTES = 96 * 1024 * 1024;
const CACHE_HEADER =
  "private, max-age=86400, stale-while-revalidate=604800";

type ThumbMeta = {
  contentType: string;
  bytes: number;
};

type MemoryEntry = {
  contentType: string;
  bytes: Uint8Array;
};

export type CachedThumb = {
  contentType: string;
  bytes: Uint8Array;
};

const memory = new Map<string, MemoryEntry>();
let memoryBytes = 0;

function cacheDir() {
  return resolveCacheDir("THUMB_CACHE_DIR", "thumbs");
}

function baseName(fileId: string, size: number) {
  return `${CACHE_VERSION}-${fileId}-s${size}`;
}

function memKey(fileId: string, size: number) {
  return `${fileId}:${size}`;
}

function pathsFor(fileId: string, size: number) {
  const dir = cacheDir();
  const base = baseName(fileId, size);
  return {
    dir,
    body: path.join(dir, base),
    meta: path.join(dir, `${base}${META_SUFFIX}`),
  };
}

function rememberMemory(
  fileId: string,
  size: number,
  bytes: Uint8Array,
  contentType: string,
) {
  if (bytes.byteLength === 0) return;
  const key = memKey(fileId, size);
  const existing = memory.get(key);
  if (existing) {
    memoryBytes -= existing.bytes.byteLength;
    memory.delete(key);
  }

  while (
    memory.size >= MEMORY_MAX_ITEMS ||
    memoryBytes + bytes.byteLength > MEMORY_MAX_BYTES
  ) {
    const oldest = memory.keys().next().value;
    if (!oldest) break;
    const entry = memory.get(oldest);
    memory.delete(oldest);
    if (entry) memoryBytes -= entry.bytes.byteLength;
  }

  const copy = bytes.slice();
  memory.set(key, { contentType: contentType || "image/jpeg", bytes: copy });
  memoryBytes += copy.byteLength;
}

export function readMemoryThumb(fileId: string, size: number) {
  const key = memKey(fileId, size);
  const hit = memory.get(key);
  if (!hit) return null;
  memory.delete(key);
  memory.set(key, hit);
  return hit;
}

async function pruneCache(dir: string) {
  const names = (await readdir(dir).catch(() => [])).filter(
    (name) => !name.endsWith(META_SUFFIX),
  );
  const entries = [];
  let total = 0;
  for (const name of names) {
    const full = path.join(dir, name);
    const info = await stat(full).catch(() => null);
    if (!info?.isFile()) continue;
    entries.push({
      full,
      meta: `${full}${META_SUFFIX}`,
      size: info.size,
      used: info.atimeMs,
    });
    total += info.size;
  }
  if (total <= CACHE_BUDGET_BYTES) return;

  entries.sort((a, b) => a.used - b.used);
  for (const entry of entries) {
    if (total <= CACHE_BUDGET_BYTES) break;
    await rm(entry.full, { force: true }).catch(() => undefined);
    await rm(entry.meta, { force: true }).catch(() => undefined);
    total -= entry.size;
  }
}

async function readDiskThumbAt(
  body: string,
  metaPath: string,
): Promise<CachedThumb | null> {
  const info = await stat(body).catch(() => null);
  if (!info?.isFile() || info.size === 0) return null;

  let contentType = "image/jpeg";
  try {
    const raw = await readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw) as ThumbMeta;
    if (parsed?.contentType) contentType = parsed.contentType;
  } catch {
    /* missing meta — still serve the body */
  }

  const bytes = new Uint8Array(await readFile(body));
  return { contentType, bytes };
}

/** Cari file disk lama (v1/ukuran lain) yang paling dekat dengan size yang diminta. */
async function readNearestDiskThumb(
  fileId: string,
  size: number,
): Promise<CachedThumb | null> {
  const dir = cacheDir();
  const names = await readdir(dir).catch(() => []);
  const escaped = fileId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^v\\d+-${escaped}-s(\\d+)$`);

  let bestName: string | null = null;
  let bestSize = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const name of names) {
    if (name.endsWith(META_SUFFIX) || name.endsWith(".part")) continue;
    const match = pattern.exec(name);
    if (!match) continue;
    const candidate = Number(match[1]);
    if (!Number.isFinite(candidate)) continue;
    // Utamakan ukuran >= diminta (lebih tajam), lalu jarak terkecil.
    const score =
      (candidate >= size ? 0 : 1_000_000) + Math.abs(candidate - size);
    if (score < bestScore) {
      bestScore = score;
      bestName = name;
      bestSize = candidate;
    }
  }

  if (!bestName || bestSize === size) return null;

  const body = path.join(dir, bestName);
  const hit = await readDiskThumbAt(body, `${body}${META_SUFFIX}`);
  if (!hit) return null;

  // Promosikan ke key ukuran yang diminta agar hit berikutnya exact.
  void writeCachedThumb(fileId, size, hit.bytes, hit.contentType);
  return hit;
}

/** Hanya exact key — jangan naikkan thumb kecil jadi seolah ukuran penuh. */
export async function readCachedThumbExact(
  fileId: string,
  size: number,
): Promise<CachedThumb | null> {
  const mem = readMemoryThumb(fileId, size);
  if (mem) return mem;

  const { body, meta } = pathsFor(fileId, size);
  const exact = await readDiskThumbAt(body, meta);
  if (exact) {
    rememberMemory(fileId, size, exact.bytes, exact.contentType);
    return exact;
  }
  return null;
}

export async function readCachedThumb(
  fileId: string,
  size: number,
): Promise<CachedThumb | null> {
  const exact = await readCachedThumbExact(fileId, size);
  if (exact) return exact;

  const nearest = await readNearestDiskThumb(fileId, size);
  if (nearest) {
    rememberMemory(fileId, size, nearest.bytes, nearest.contentType);
    return nearest;
  }

  return null;
}

export async function writeCachedThumb(
  fileId: string,
  size: number,
  bytes: Uint8Array,
  contentType: string,
) {
  if (bytes.byteLength === 0) return;
  rememberMemory(fileId, size, bytes, contentType);

  const { dir, body, meta } = pathsFor(fileId, size);
  await ensureDir(dir);
  const partial = `${body}.part`;

  try {
    await writeFile(partial, bytes);
    await writeFile(
      meta,
      JSON.stringify({
        contentType: contentType || "image/jpeg",
        bytes: bytes.byteLength,
      } satisfies ThumbMeta),
    );
    await rename(partial, body);
  } catch {
    await rm(partial, { force: true }).catch(() => undefined);
    return;
  }

  void pruneCache(dir).catch(() => undefined);
}

/**
 * Stream ke klien segera; salinan di-cache (memori + disk) di background.
 */
export function cacheThumbResponse(
  fileId: string,
  size: number,
  res: Response,
) {
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const body = res.body;
  if (!body) {
    return new Response(null, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const [forClient, forCache] = body.tee();
  void (async () => {
    try {
      const buffer = new Uint8Array(await new Response(forCache).arrayBuffer());
      await writeCachedThumb(fileId, size, buffer, contentType);
    } catch {
      /* cache best-effort */
    }
  })();

  return new Response(forClient, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_HEADER,
      "X-Thumb-Cache": "miss",
    },
  });
}

export function cachedThumbResponse(hit: CachedThumb) {
  return new Response(Buffer.from(hit.bytes), {
    headers: {
      "Content-Type": hit.contentType,
      "Content-Length": String(hit.bytes.byteLength),
      "Cache-Control": CACHE_HEADER,
      "X-Thumb-Cache": "hit",
    },
  });
}

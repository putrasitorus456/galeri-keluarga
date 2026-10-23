import { getAccessToken, peekThumbnailLink } from "@/lib/drive";
import { driveThumbnailUrl, enlargeThumbnailLink } from "@/lib/heic";
import { THUMB } from "@/lib/media-url";
import {
  readCachedThumb,
  readMemoryThumb,
  writeCachedThumb,
} from "@/lib/thumb-cache";
import type { MediaItem } from "@/lib/types";

const WARM_LIMIT = 24;
const WARM_CONCURRENCY = 4;

async function fetchThumbBytes(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (contentType.includes("text/html")) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength === 0) return null;
  return { bytes, contentType };
}

async function warmOne(fileId: string, size: number, token: string) {
  if (readMemoryThumb(fileId, size)) return;
  if (await readCachedThumb(fileId, size)) return;

  const remembered = peekThumbnailLink(fileId);
  const urls = [
    remembered ? enlargeThumbnailLink(remembered, size) : null,
    driveThumbnailUrl(fileId, size),
  ].filter((url): url is string => Boolean(url));

  for (const url of urls) {
    const hit = await fetchThumbBytes(url, token);
    if (!hit) continue;
    await writeCachedThumb(fileId, size, hit.bytes, hit.contentType);
    return;
  }
}

/**
 * Isi cache thumb untuk item awal halaman album (fire-and-forget).
 * Tidak menunda respons JSON ke klien.
 */
export function warmAlbumGridThumbs(items: MediaItem[]) {
  const ids = items.slice(0, WARM_LIMIT).map((item) => item.id);
  if (ids.length === 0) return;

  void (async () => {
    try {
      const token = await getAccessToken();
      const size = THUMB.grid;
      let next = 0;

      async function worker() {
        while (next < ids.length) {
          const index = next;
          next += 1;
          await warmOne(ids[index], size, token).catch(() => undefined);
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(WARM_CONCURRENCY, ids.length) },
          () => worker(),
        ),
      );
    } catch {
      /* warm best-effort */
    }
  })();
}

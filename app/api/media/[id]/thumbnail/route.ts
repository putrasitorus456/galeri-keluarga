import { getSession } from "@/lib/auth";
import { getAccessToken, getThumbnailSource, peekThumbnailLink } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";
import { driveThumbnailUrl, enlargeThumbnailLink } from "@/lib/heic";
import {
  cachedThumbResponse,
  cacheThumbResponse,
  readCachedThumb,
  readMemoryThumb,
} from "@/lib/thumb-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_THUMB_SIZE = 100;
const MAX_THUMB_SIZE = 2048;
const DEFAULT_THUMB_SIZE = 240;

function requestedSize(request: Request) {
  const raw = Number(new URL(request.url).searchParams.get("s"));
  if (!Number.isFinite(raw)) return DEFAULT_THUMB_SIZE;
  return Math.min(MAX_THUMB_SIZE, Math.max(MIN_THUMB_SIZE, Math.round(raw)));
}

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <rect width="240" height="240" fill="#1c1c1e"/>
</svg>`;

function placeholder(maxAge = 60) {
  return new Response(PLACEHOLDER_SVG, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": `private, max-age=${maxAge}`,
    },
  });
}

async function fetchThumb(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (contentType.includes("text/html")) return null;
  return res;
}

/** Coba URL secara berurutan — hindari menggandakan QPS ke Drive. */
async function fetchFirstThumb(urls: string[], token: string) {
  for (const url of [...new Set(urls)]) {
    const res = await fetchThumb(url, token);
    if (res) return res;
  }
  return null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const size = requestedSize(request);

  try {
    const hot = readMemoryThumb(id, size);
    if (hot) return cachedThumbResponse(hot);

    const cached = await readCachedThumb(id, size);
    if (cached) return cachedThumbResponse(cached);

    const token = await getAccessToken();
    const remembered = peekThumbnailLink(id);
    const candidates = [
      remembered ? enlargeThumbnailLink(remembered, size) : null,
      driveThumbnailUrl(id, size),
    ].filter((url): url is string => Boolean(url));

    const fast = await fetchFirstThumb(candidates, token);
    if (fast) return cacheThumbResponse(id, size, fast);

    // Fallback mahal: metadata Drive — hanya jika keduanya gagal.
    const source = await getThumbnailSource(id);
    if (source.thumbnailLink) {
      const fromMeta = await fetchThumb(
        enlargeThumbnailLink(source.thumbnailLink, size),
        token,
      );
      if (fromMeta) return cacheThumbResponse(id, size, fromMeta);
    }

    return placeholder(300);
  } catch (err) {
    return errorResponse(err);
  }
}

import { getSession } from "@/lib/auth";
import { getAccessToken, getThumbnailSource, peekThumbnailLink } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";
import { driveThumbnailUrl, enlargeThumbnailLink } from "@/lib/heic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const THUMB_SIZE = 800;
const CACHE_HEADER = "private, max-age=86400, stale-while-revalidate=604800";

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <rect width="400" height="400" fill="#1c1c1e"/>
  <rect x="120" y="130" width="160" height="120" rx="12" fill="#3a3a3c"/>
  <circle cx="168" cy="172" r="16" fill="#1c1c1e"/>
  <polygon points="140,230 190,190 230,220 260,200 280,230" fill="#1c1c1e"/>
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
  return new Response(res.body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_HEADER,
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;

  try {
    const token = await getAccessToken();
    const remembered = peekThumbnailLink(id);
    const fromMemory = remembered
      ? await fetchThumb(enlargeThumbnailLink(remembered, THUMB_SIZE), token)
      : null;
    if (fromMemory) return fromMemory;

    const direct = await fetchThumb(driveThumbnailUrl(id, THUMB_SIZE), token);
    if (direct) return direct;

    const source = await getThumbnailSource(id);
    if (source.thumbnailLink) {
      const fromMeta = await fetchThumb(
        enlargeThumbnailLink(source.thumbnailLink, THUMB_SIZE),
        token,
      );
      if (fromMeta) return fromMeta;
    }

    return placeholder(300);
  } catch (err) {
    return errorResponse(err);
  }
}

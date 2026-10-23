import { getSession } from "@/lib/auth";
import {
  getAccessToken,
  getFileStream,
  getMediaMeta,
  isHeicMime,
} from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";
import {
  convertHeicStreamToJpeg,
  enlargeThumbnailLink,
  jpegPreviewName,
} from "@/lib/heic";
import {
  contentDisposition,
  localFileResponse,
  nodeStreamToWeb,
} from "@/lib/stream";
import {
  cachedThumbResponse,
  readCachedThumbExact,
  writeCachedThumb,
} from "@/lib/thumb-cache";
import {
  getCachedPlayableVideo,
  getPlayableVideo,
  mp4PreviewName,
} from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Bucket khusus JPEG hasil konversi HEIC penuh.
 * Bukan ukuran thumb biasa — jangan pakai readCachedThumb (nearest) di sini.
 * Key baru (16384) mengabaikan cache s4096 yang sempat terisi thumb 2048.
 */
const HEIC_FULL_CACHE_KEY = 16384;
const HEIC_FALLBACK_SIZE = 2048;
const HEIC_CONVERT_TIMEOUT_MS = 90_000;

const warmingHeic = new Set<string>();

function heicFullResponse(
  jpeg: Uint8Array,
  disposition: string,
  cacheHeader: string,
) {
  return new Response(new Uint8Array(jpeg), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": cacheHeader,
      "Content-Length": String(jpeg.length),
      "Content-Disposition": disposition,
      "X-Gallery-Quality": "full",
    },
  });
}

async function driveThumbFallback(
  id: string,
  meta: { name: string; thumbnailLink: string | null },
  disposition: string,
) {
  const token = await getAccessToken();
  if (!meta.thumbnailLink) return null;

  const thumb = await fetch(
    enlargeThumbnailLink(meta.thumbnailLink, HEIC_FALLBACK_SIZE),
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!thumb.ok || thumb.headers.get("content-type")?.includes("text/html")) {
    return null;
  }

  const bytes = new Uint8Array(await thumb.arrayBuffer());
  if (bytes.byteLength === 0) return null;

  // Cache untuk grid/pratinjau saja — jangan jadikan ini jawaban /file yang di-cache lama.
  void writeCachedThumb(id, HEIC_FALLBACK_SIZE, bytes, "image/jpeg");

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      // no-store agar browser tidak mengunci preview sebagai "file HD".
      "Cache-Control": "no-store",
      "Content-Disposition": disposition,
      "X-Gallery-Quality": "preview",
    },
  });
}

async function convertAndCacheHeic(id: string) {
  const { stream } = await getFileStream(id, null, { alreadyVerified: true });
  const jpeg = await convertHeicStreamToJpeg(stream, HEIC_CONVERT_TIMEOUT_MS);
  await writeCachedThumb(id, HEIC_FULL_CACHE_KEY, jpeg, "image/jpeg");
  return jpeg;
}

function warmHeicFull(id: string) {
  if (warmingHeic.has(id)) return;
  warmingHeic.add(id);
  void convertAndCacheHeic(id)
    .catch((err) => {
      console.error("HEIC background conversion failed", id, err);
    })
    .finally(() => {
      warmingHeic.delete(id);
    });
}

async function heicPreviewResponse(
  request: Request,
  id: string,
  meta: { name: string; thumbnailLink: string | null },
) {
  const disposition = contentDisposition(jpegPreviewName(meta.name), true);
  const url = new URL(request.url);

  if (url.searchParams.get("check") === "1") {
    const cached = await readCachedThumbExact(id, HEIC_FULL_CACHE_KEY);
    return Response.json(
      { ready: Boolean(cached) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const cached = await readCachedThumbExact(id, HEIC_FULL_CACHE_KEY);
  if (cached) {
    const res = cachedThumbResponse(cached);
    res.headers.set("Content-Disposition", disposition);
    res.headers.set("X-Gallery-Quality", "full");
    return res;
  }

  // Coba konversi penuh dulu (timeout). Preview hanya cadangan + upgrade belakangan.
  try {
    const jpeg = await convertAndCacheHeic(id);
    return heicFullResponse(
      jpeg,
      disposition,
      "private, max-age=86400, stale-while-revalidate=604800",
    );
  } catch (err) {
    console.error("HEIC full conversion failed, falling back to Drive thumb", err);
  }

  warmHeicFull(id);
  const fallback = await driveThumbFallback(id, meta, disposition);
  if (fallback) return fallback;

  throw new Error("HEIC preview unavailable");
}

async function streamMedia(request: Request, id: string) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const meta = await getMediaMeta(id);
    if (isHeicMime(meta.mimeType)) {
      return heicPreviewResponse(request, id, {
        name: meta.name,
        thumbnailLink: meta.thumbnailLink,
      });
    }

    const range = request.headers.get("range");

    const mediaUrl = new URL(request.url);
    const wantsMp4 =
      mediaUrl.searchParams.get("transcode") === "1" &&
      meta.mimeType.startsWith("video/");
    if (wantsMp4) {
      if (
        mediaUrl.searchParams.get("prepare") === "1" &&
        mediaUrl.searchParams.get("check") === "1"
      ) {
        const cached = await getCachedPlayableVideo(id);
        return Response.json(
          cached
            ? { ready: true, size: cached.size }
            : { ready: false },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      const playable = await getPlayableVideo(id, meta.size);
      if (mediaUrl.searchParams.get("prepare") === "1") {
        return Response.json(
          { ready: true, size: playable.size },
          { headers: { "Cache-Control": "no-store" } },
        );
      }
      return localFileResponse(playable.path, playable.size, range, {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": contentDisposition(
          mp4PreviewName(meta.name),
          true,
        ),
      });
    }

    const { stream, status, headers } = await getFileStream(id, range, {
      alreadyVerified: true,
    });

    const out = new Headers();
    const contentType =
      String(headers["content-type"] || meta.mimeType || "application/octet-stream");
    out.set("Content-Type", contentType);
    out.set("Accept-Ranges", "bytes");
    out.set("Cache-Control", "private, max-age=3600");
    out.set("Content-Disposition", contentDisposition(meta.name, true));
    out.set("X-Gallery-Quality", "full");

    if (headers["content-length"] != null) {
      out.set("Content-Length", String(headers["content-length"]));
    }
    if (headers["content-range"]) {
      out.set("Content-Range", String(headers["content-range"]));
    }

    const responseStatus =
      range && Number(status) === 206 ? 206 : Number(status) || 200;

    return new Response(nodeStreamToWeb(stream), {
      status: responseStatus,
      headers: out,
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  return streamMedia(request, id);
}

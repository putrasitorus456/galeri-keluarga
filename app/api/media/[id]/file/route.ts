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
  cacheThumbResponse,
  readCachedThumb,
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

/** Bucket cache terpisah dari thumbnail Drive agar hasil konversi penuh tidak tercampur. */
const HEIC_FULL_CACHE_KEY = 4096;
const HEIC_FALLBACK_SIZE = 2048;

async function heicPreviewResponse(
  id: string,
  meta: { name: string; thumbnailLink: string | null },
) {
  const disposition = contentDisposition(jpegPreviewName(meta.name), true);
  const cached = await readCachedThumb(id, HEIC_FULL_CACHE_KEY);
  if (cached) {
    const res = cachedThumbResponse(cached);
    res.headers.set("Content-Disposition", disposition);
    return res;
  }

  // Utamakan konversi file asli (kualitas penuh). Thumbnail Drive hanya cadangan
  // bila konversi gagal — viewer sudah menampilkan pratinjau sambil menunggu.
  try {
    const { stream } = await getFileStream(id, null, { alreadyVerified: true });
    const jpeg = await convertHeicStreamToJpeg(stream);
    void writeCachedThumb(id, HEIC_FULL_CACHE_KEY, jpeg, "image/jpeg");
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
        "Content-Length": String(jpeg.length),
        "Content-Disposition": disposition,
      },
    });
  } catch (err) {
    console.error("HEIC full conversion failed, falling back to Drive thumb", err);
  }

  const token = await getAccessToken();
  if (meta.thumbnailLink) {
    const thumb = await fetch(
      enlargeThumbnailLink(meta.thumbnailLink, HEIC_FALLBACK_SIZE),
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (thumb.ok && !thumb.headers.get("content-type")?.includes("text/html")) {
      // Jangan tulis ke HEIC_FULL_CACHE_KEY — itu khusus hasil konversi penuh.
      const res = cacheThumbResponse(id, HEIC_FALLBACK_SIZE, thumb);
      res.headers.set("Content-Disposition", disposition);
      return res;
    }
  }

  throw new Error("HEIC preview unavailable");
}

async function streamMedia(request: Request, id: string) {
  const session = await getSession();
  if (!session) return unauthorized();

  try {
    const meta = await getMediaMeta(id);
    if (isHeicMime(meta.mimeType)) {
      return heicPreviewResponse(id, meta);
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

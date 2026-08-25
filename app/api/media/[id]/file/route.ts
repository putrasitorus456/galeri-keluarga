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
import { contentDisposition, nodeStreamToWeb } from "@/lib/stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function heicPreviewResponse(
  id: string,
  meta: { name: string; thumbnailLink: string | null },
) {
  const token = await getAccessToken();
  if (meta.thumbnailLink) {
    const thumb = await fetch(enlargeThumbnailLink(meta.thumbnailLink, 2048), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (thumb.ok && !thumb.headers.get("content-type")?.includes("text/html")) {
      return new Response(thumb.body, {
        headers: {
          "Content-Type": thumb.headers.get("content-type") || "image/jpeg",
          "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800",
          "Content-Disposition": contentDisposition(
            jpegPreviewName(meta.name),
            true,
          ),
        },
      });
    }
  }

  try {
    const { stream } = await getFileStream(id, null, { alreadyVerified: true });
    const jpeg = await convertHeicStreamToJpeg(stream);
    return new Response(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
        "Content-Length": String(jpeg.length),
        "Content-Disposition": contentDisposition(
          jpegPreviewName(meta.name),
          true,
        ),
      },
    });
  } catch (err) {
    console.error("HEIC preview conversion failed", err);
    throw err;
  }
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

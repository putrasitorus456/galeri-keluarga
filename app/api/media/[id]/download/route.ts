import { getSession } from "@/lib/auth";
import { getFileStream, getMediaMeta } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";
import {
  contentDisposition,
  localFileResponse,
  nodeStreamToWeb,
} from "@/lib/stream";
import { getPlayableVideo, mp4PreviewName } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;

  try {
    const meta = await getMediaMeta(id);
    const range = request.headers.get("range");

    const wantsMp4 =
      new URL(request.url).searchParams.get("transcode") === "1" &&
      meta.mimeType.startsWith("video/");
    if (wantsMp4) {
      const playable = await getPlayableVideo(id, meta.size);
      return localFileResponse(playable.path, playable.size, range, {
        "Content-Type": "video/mp4",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": contentDisposition(
          mp4PreviewName(meta.name),
          false,
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
    out.set("Content-Disposition", contentDisposition(meta.name, false));

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

import { getSession } from "@/lib/auth";
import { getAlbumWithMedia } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;
  const url = new URL(request.url);
  const pageToken = url.searchParams.get("pageToken") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;
  const fresh = url.searchParams.get("fresh") === "1";
  const typeFilter =
    type === "image" || type === "video" ? type : undefined;

  try {
    const result = await getAlbumWithMedia(id, pageToken, typeFilter, fresh);
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

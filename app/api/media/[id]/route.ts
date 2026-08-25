import { getSession } from "@/lib/auth";
import { getMediaMeta } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await context.params;

  try {
    const { albumId, media } = await getMediaMeta(id);
    return Response.json({ albumId, media });
  } catch (err) {
    return errorResponse(err);
  }
}

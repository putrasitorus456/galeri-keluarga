import { getSession } from "@/lib/auth";
import { getAlbums } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const fresh = new URL(request.url).searchParams.get("fresh") === "1";

  try {
    const albums = await getAlbums(fresh);
    return Response.json({ albums });
  } catch (err) {
    return errorResponse(err);
  }
}

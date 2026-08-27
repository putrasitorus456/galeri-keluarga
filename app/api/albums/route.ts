import { getSession } from "@/lib/auth";
import { getAlbums } from "@/lib/drive";
import { cachedJson, errorResponse, unauthorized } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const details = url.searchParams.get("details") === "1";

  try {
    const albums = await getAlbums(fresh, { details });
    return cachedJson({ albums }, details ? 30 : 15);
  } catch (err) {
    return errorResponse(err);
  }
}

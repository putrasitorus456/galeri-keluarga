import { getSession } from "@/lib/auth";
import { getLibraryMedia } from "@/lib/drive";
import { errorResponse, unauthorized } from "@/lib/http";
import type { LibraryKind } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseType(value: string | null): LibraryKind | undefined {
  if (value === "image" || value === "video" || value === "gif") return value;
  return undefined;
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const type = parseType(url.searchParams.get("type"));
  const collection = url.searchParams.get("collection") ?? undefined;
  const fresh = url.searchParams.get("fresh") === "1";

  try {
    const result = await getLibraryMedia({ type, collection, fresh });
    return Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

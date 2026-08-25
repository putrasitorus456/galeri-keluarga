import { redirect } from "next/navigation";
import { getMediaMeta } from "@/lib/drive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ShareTargetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { albumId } = await getMediaMeta(id);
  redirect(`/album/${albumId}/${id}`);
}

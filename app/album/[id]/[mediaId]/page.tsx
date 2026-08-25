import { MediaViewer } from "@/components/MediaViewer";

export default async function MediaPage({
  params,
}: {
  params: Promise<{ id: string; mediaId: string }>;
}) {
  const { id, mediaId } = await params;
  return <MediaViewer albumId={id} mediaId={mediaId} />;
}

import { notFound } from "next/navigation";
import { MediaViewer } from "@/components/MediaViewer";
import { getLibraryKind } from "@/lib/collections";

export default async function TipeMediaPage({
  params,
}: {
  params: Promise<{ kind: string; mediaId: string }>;
}) {
  const { kind, mediaId } = await params;
  const spec = getLibraryKind(kind);
  if (!spec) notFound();
  return (
    <MediaViewer
      mediaId={mediaId}
      library={{ ...spec, basePath: `/tipe/${kind}` }}
    />
  );
}

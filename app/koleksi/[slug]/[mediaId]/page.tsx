import { notFound } from "next/navigation";
import { MediaViewer } from "@/components/MediaViewer";
import { getCollectionDef } from "@/lib/collections";

export default async function KoleksiMediaPage({
  params,
}: {
  params: Promise<{ slug: string; mediaId: string }>;
}) {
  const { slug, mediaId } = await params;
  const def = getCollectionDef(slug);
  if (!def) notFound();
  return (
    <MediaViewer
      mediaId={mediaId}
      library={{
        title: def.label,
        collection: def.slug,
        basePath: `/koleksi/${def.slug}`,
      }}
    />
  );
}

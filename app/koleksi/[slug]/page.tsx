import { notFound } from "next/navigation";
import { AlbumView } from "@/components/AlbumView";
import { getCollectionDef } from "@/lib/collections";

export default async function KoleksiPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const def = getCollectionDef(slug);
  if (!def) notFound();
  return <AlbumView library={{ title: def.label, collection: def.slug }} />;
}

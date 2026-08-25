import { AlbumView } from "@/components/AlbumView";

export default async function AlbumPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AlbumView albumId={id} />;
}

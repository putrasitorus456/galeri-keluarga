import { notFound } from "next/navigation";
import { AlbumView } from "@/components/AlbumView";

const KINDS = {
  foto: { title: "Foto", type: "image" as const },
  video: { title: "Video", type: "video" as const },
  gif: { title: "GIF", type: "gif" as const },
  terbaru: { title: "Terbaru" },
};

export default async function TipePage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  const spec = KINDS[kind as keyof typeof KINDS];
  if (!spec) notFound();
  return <AlbumView library={spec} />;
}

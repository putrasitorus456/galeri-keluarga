import type { Album, LibraryKind } from "@/lib/types";

export const TERBARU_LIMIT = 6;

export type LibraryKindDef = { title: string; type?: LibraryKind };

const LIBRARY_KINDS: Record<string, LibraryKindDef> = {
  foto: { title: "Foto", type: "image" },
  video: { title: "Video", type: "video" },
  gif: { title: "GIF", type: "gif" },
  terbaru: { title: "Semua kenangan" },
};

export function getLibraryKind(kind: string): LibraryKindDef | undefined {
  return Object.prototype.hasOwnProperty.call(LIBRARY_KINDS, kind)
    ? LIBRARY_KINDS[kind]
    : undefined;
}

export const COLLECTION_DEFS = [
  { slug: "wisuda", label: "Wisuda", pattern: /wisuda/i },
  { slug: "ulang-tahun", label: "Ulang Tahun", pattern: /ulang\s*tahun|\bultah\b/i },
  { slug: "liburan", label: "Liburan", pattern: /liburan|holiday|piknik/i },
  { slug: "lebaran", label: "Lebaran", pattern: /lebaran|idul\s*fitri/i },
  { slug: "natal", label: "Natal", pattern: /natal|christmas/i },
  { slug: "pelantikan", label: "Pelantikan", pattern: /pelantikan/i },
] as const;

export type CollectionDef = (typeof COLLECTION_DEFS)[number];

export function getCollectionDef(slug: string) {
  return COLLECTION_DEFS.find((def) => def.slug === slug);
}

export function sortAlbumsByRecent(albums: Album[]) {
  return [...albums].sort((a, b) => {
    const time = (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? "");
    if (time !== 0) return time;
    return a.name.localeCompare(b.name, "id");
  });
}

export function splitHomeAlbums(albums: Album[]) {
  const sorted = sortAlbumsByRecent(albums);
  return {
    terbaru: sorted.slice(0, TERBARU_LIMIT),
    lainnya: sorted.slice(TERBARU_LIMIT),
  };
}

export function featuredCollections(albums: Album[]) {
  return COLLECTION_DEFS.map((def) => {
    const matched = albums.filter((album) => def.pattern.test(album.name));
    const itemCount = matched.reduce(
      (sum, album) => sum + (album.itemCount ?? 0),
      0,
    );
    const thumbnails = matched.flatMap(
      (album) => album.thumbnailUrls ?? (album.thumbnailUrl ? [album.thumbnailUrl] : []),
    );
    return {
      slug: def.slug,
      label: def.label,
      albums: matched,
      itemCount,
      thumbnails: thumbnails.slice(0, 4),
    };
  }).filter((group) => group.albums.length >= 2);
}

export function sumCounts(albums: Album[]) {
  return albums.reduce(
    (acc, album) => {
      acc.items += album.itemCount ?? 0;
      acc.images += album.imageCount ?? 0;
      acc.videos += album.videoCount ?? 0;
      acc.gifs += album.gifCount ?? 0;
      return acc;
    },
    { items: 0, images: 0, videos: 0, gifs: 0 },
  );
}

export function collageThumbnails(albums: Album[], limit = 4) {
  return albums
    .flatMap((album) =>
      album.thumbnailUrls ?? (album.thumbnailUrl ? [album.thumbnailUrl] : []),
    )
    .slice(0, limit);
}

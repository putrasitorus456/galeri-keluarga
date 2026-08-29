"use client";

import { albumCoverClass } from "@/components/BrandMark";
import { IconFolder, IconPhoto } from "@/components/Icons";
import { BusyLink, ThumbImage } from "@/components/Loading";
import { formatAlbumMeta } from "@/lib/format";
import { prefetchAlbum, prefetchLibraryView } from "@/lib/gallery-cache";
import type { Album } from "@/lib/types";

function CoverFallback({ album }: { album: Album }) {
  const hasFolders = (album.folderCount ?? 0) > 0;

  return (
    <span
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${albumCoverClass(album.id)}`}
    >
      {hasFolders ? (
        <IconFolder className="h-8 w-8 text-white/35" />
      ) : (
        <IconPhoto className="h-8 w-8 text-white/35" />
      )}
    </span>
  );
}

export function AlbumCoverCard({
  album,
  eager = false,
}: {
  album: Album;
  eager?: boolean;
}) {
  return (
    <BusyLink
      href={`/album/${album.id}`}
      label="Membuka album"
      onPointerDown={() => void prefetchAlbum(album.id)}
      onPointerEnter={() => void prefetchAlbum(album.id)}
      className="group flex flex-col items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <span className="relative aspect-square w-full overflow-hidden rounded-[1.15rem] bg-paper-deep">
        {album.thumbnailUrl ? (
          <ThumbImage
            src={album.thumbnailUrl}
            alt=""
            eager={eager}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <CoverFallback album={album} />
        )}
        {album.folderCount ? (
          <span className="absolute left-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <IconFolder className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </span>
      <span
        title={album.name}
        className="mt-2 line-clamp-2 min-h-[2.1rem] w-full text-center text-[13px] font-medium leading-snug break-words text-white"
      >
        {album.name}
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[12px] leading-tight text-muted">
        {formatAlbumMeta(album) || "\u00a0"}
      </span>
    </BusyLink>
  );
}

export function CollageCard({
  href,
  title,
  count,
  thumbnails,
}: {
  href: string;
  title: string;
  count?: number;
  thumbnails: string[];
}) {
  const cells = [0, 1, 2, 3].map((index) => thumbnails[index]);

  return (
    <BusyLink
      href={href}
      label={`Membuka ${title}`}
      onPointerDown={() => {
        if (href.startsWith("/tipe/")) {
          const kind = href.split("/")[2];
          const type =
            kind === "foto" ? "image" : kind === "video" ? "video" : kind === "gif" ? "gif" : undefined;
          void prefetchLibraryView({ type });
        } else if (href.startsWith("/koleksi/")) {
          void prefetchLibraryView({ collection: href.split("/")[2] });
        }
      }}
      className="group flex flex-col items-center focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
    >
      <span className="aspect-square w-full overflow-hidden rounded-[1.15rem] bg-paper-deep">
        <span className="grid h-full grid-cols-2 grid-rows-2 gap-px bg-black">
          {cells.map((src, index) => (
            <span key={index} className="relative bg-[#2c2c2e]">
              {src ? (
                <ThumbImage
                  src={src}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
            </span>
          ))}
        </span>
      </span>
      <span
        title={title}
        className="mt-2 line-clamp-2 min-h-[2.1rem] w-full text-center text-[13px] font-medium leading-snug break-words text-white"
      >
        {title}
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[12px] leading-tight text-muted">
        {typeof count === "number" ? count.toLocaleString("id-ID") : "\u00a0"}
      </span>
    </BusyLink>
  );
}

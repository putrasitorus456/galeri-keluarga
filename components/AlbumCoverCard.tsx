"use client";

import { albumCoverClass } from "@/components/BrandMark";
import { IconPhoto } from "@/components/Icons";
import { BusyLink, ThumbImage } from "@/components/Loading";
import type { Album } from "@/lib/types";

function CoverFallback({ albumId }: { albumId: string }) {
  return (
    <span
      className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${albumCoverClass(albumId)}`}
    >
      <IconPhoto className="h-8 w-8 text-white/35" />
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
          <CoverFallback albumId={album.id} />
        )}
      </span>
      <span className="mt-2 w-full truncate text-center text-[13px] font-medium leading-tight text-white">
        {album.name}
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[12px] leading-tight text-muted">
        {(album.itemCount ?? 0).toLocaleString("id-ID")}
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
      <span className="mt-2 w-full truncate text-center text-[13px] font-medium leading-tight text-white">
        {title}
      </span>
      <span className="mt-0.5 w-full truncate text-center text-[12px] leading-tight text-muted">
        {(count ?? 0).toLocaleString("id-ID")}
      </span>
    </BusyLink>
  );
}

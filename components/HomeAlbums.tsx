"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import {
  collageThumbnails,
  featuredCollections,
  splitHomeAlbums,
  sumCounts,
} from "@/lib/collections";
import { MESSAGES } from "@/lib/errors";
import {
  CACHE_ALBUMS,
  cacheClear,
  cacheGet,
  cacheIsFresh,
  cacheSet,
  cachedAlbums,
  prefetchLibraryView,
} from "@/lib/gallery-cache";
import { useScrollMemory } from "@/lib/use-scroll-memory";
import type { Album, AlbumsResponse } from "@/lib/types";
import { AlbumCoverCard, CollageCard } from "@/components/AlbumCoverCard";
import { AppHeader } from "@/components/AppHeader";
import { BottomDock, IconButton } from "@/components/Chrome";
import { InstallAppButton } from "@/components/InstallAppButton";
import {
  IconChevron,
  IconClose,
  IconGif,
  IconLogout,
  IconPhoto,
  IconRefresh,
  IconSearch,
  IconVideo,
} from "@/components/Icons";
import { BusyLink } from "@/components/Loading";
import { AlbumSkeleton, EmptyState, ErrorState } from "@/components/States";

function SectionTitle({
  title,
  href,
}: {
  title: string;
  href?: string;
}) {
  const heading = (
    <h2 className="text-[17px] font-semibold tracking-tight text-white">
      {title}
    </h2>
  );

  if (!href) {
    return <div className="mb-3 px-4">{heading}</div>;
  }

  return (
    <div className="mb-3 px-4">
      <BusyLink
        href={href}
        label={`Membuka ${title}`}
        className="flex items-center justify-between gap-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        {heading}
        <IconChevron className="h-5 w-5 text-muted" />
      </BusyLink>
    </div>
  );
}

function MediaTypeRow({
  href,
  icon,
  label,
  count,
  last,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  count?: number;
  last?: boolean;
}) {
  return (
    <BusyLink
      href={href}
      label={`Membuka ${label}`}
      onPointerDown={() => {
        if (href === "/tipe/foto") void prefetchLibraryView({ type: "image" });
        if (href === "/tipe/video") void prefetchLibraryView({ type: "video" });
        if (href === "/tipe/gif") void prefetchLibraryView({ type: "gif" });
      }}
      className="flex min-h-[3.35rem] items-center gap-3 px-4 text-white focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center text-white">
        {icon}
      </span>
      <span
        className={`flex min-h-[3.35rem] min-w-0 flex-1 items-center justify-between gap-3 ${
          last ? "" : "border-b border-white/8"
        }`}
      >
        <span className="truncate text-[16px]">{label}</span>
        <span className="flex shrink-0 items-center gap-2 text-[15px] text-muted">
          {typeof count === "number" ? count.toLocaleString("id-ID") : null}
          <IconChevron className="h-5 w-5" />
        </span>
      </span>
    </BusyLink>
  );
}

export function HomeAlbums({
  mode = "home",
}: {
  mode?: "home" | "all";
}) {
  const [albums, setAlbums] = useState<Album[] | null>(() => cachedAlbums() ?? null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isAll = mode === "all";
  useScrollMemory(isAll ? "albums-all" : "home");

  const load = useCallback(async (fresh = false) => {
    if (!fresh) {
      const cached = cacheGet<AlbumsResponse>(CACHE_ALBUMS);
      if (cached) setAlbums(cached.albums);
      const detailed = cached?.albums.every(
        (album) => typeof album.itemCount === "number" || !album.thumbnailUrl,
      );
      if (cached && cacheIsFresh(CACHE_ALBUMS) && detailed) return;
    }
    setError(null);
    try {
      if (fresh || !cacheGet(CACHE_ALBUMS)) {
        const lite = await apiFetch<AlbumsResponse>("/api/albums");
        if (!cacheGet(CACHE_ALBUMS) || fresh) {
          cacheSet(CACHE_ALBUMS, lite);
          setAlbums(lite.albums);
        }
        const complete = lite.albums.every(
          (album) => typeof album.itemCount === "number" || !album.thumbnailUrl,
        );
        if (complete && !fresh) return;
      }
      const data = await apiFetch<AlbumsResponse>(
        `/api/albums?details=1${fresh ? "&fresh=1" : ""}`,
      );
      cacheSet(CACHE_ALBUMS, data);
      setAlbums(data.albums);
    } catch (err) {
      if (!cacheGet(CACHE_ALBUMS)) setError(userMessage(err));
    }
  }, []);

  useLayoutEffect(() => {
    const cached = cacheGet<AlbumsResponse>(CACHE_ALBUMS);
    if (cached) setAlbums(cached.albums);
  }, []);

  useEffect(() => {
    void load(false);
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  async function logout() {
    cacheClear();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.replace("/login");
  }

  const needle = query.trim().toLowerCase();
  const searched = useMemo(() => {
    if (!albums) return [];
    if (!needle) return albums;
    return albums.filter((album) => album.name.toLowerCase().includes(needle));
  }, [albums, needle]);

  const { terbaru, lainnya } = useMemo(
    () => splitHomeAlbums(searched),
    [searched],
  );
  const featured = useMemo(
    () => featuredCollections(searched),
    [searched],
  );
  const totals = useMemo(() => sumCounts(albums ?? []), [albums]);
  const allThumbs = useMemo(
    () => collageThumbnails(albums ?? []),
    [albums],
  );
  const gridAlbums = needle || !isAll ? searched : lainnya;

  const typeRows = [
    {
      href: "/tipe/foto",
      label: "Foto",
      count: totals.images,
      icon: <IconPhoto className="h-[1.35rem] w-[1.35rem]" />,
    },
    {
      href: "/tipe/video",
      label: "Video",
      count: totals.videos,
      icon: <IconVideo className="h-[1.35rem] w-[1.35rem]" />,
    },
    ...(totals.gifs > 0
      ? [
          {
            href: "/tipe/gif",
            label: "GIF",
            count: totals.gifs,
            icon: <IconGif className="h-[1.35rem] w-[1.35rem]" />,
          },
        ]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col bg-black">
      <AppHeader
        title={isAll ? "Album lainnya" : "Album"}
        large={!isAll}
        titleAction={!isAll ? <InstallAppButton /> : undefined}
        backHref={isAll ? "/" : undefined}
        actions={
          <>
            <IconButton
              label={searchOpen ? "Tutup pencarian" : "Cari album"}
              onClick={() => {
                setSearchOpen((value) => !value);
                if (searchOpen) setQuery("");
              }}
            >
              {searchOpen ? (
                <IconClose className="h-5 w-5" />
              ) : (
                <IconSearch className="h-[1.35rem] w-[1.35rem]" />
              )}
            </IconButton>
            <IconButton
              label={refreshing ? "Memuat..." : "Muat ulang"}
              onClick={() => void refresh()}
              disabled={refreshing}
            >
              <IconRefresh className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
            </IconButton>
            <IconButton label="Keluar" onClick={() => void logout()}>
              <IconLogout className="h-5 w-5" />
            </IconButton>
          </>
        }
      />

      {searchOpen ? (
        <div className="px-4 pb-2">
          <label className="sr-only" htmlFor="album-search">
            Cari album
          </label>
          <input
            id="album-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari album"
            autoFocus
            className="h-11 w-full rounded-full bg-paper-deep px-4 text-[15px] text-white outline-none placeholder:text-muted"
          />
        </div>
      ) : null}

      <main className="flex flex-1 flex-col pb-28">
        {error ? (
          <ErrorState message={error} onRetry={() => void load(true)} />
        ) : albums === null ? (
          <AlbumSkeleton />
        ) : albums.length === 0 ? (
          <EmptyState message={MESSAGES.albumsEmpty} />
        ) : searched.length === 0 ? (
          <EmptyState message="Tidak ada album dengan nama itu." />
        ) : isAll ? (
          gridAlbums.length === 0 ? (
            <EmptyState message="Semua album sudah tampil di Terbaru." />
          ) : (
            <ul className="grid grid-cols-3 gap-x-3 gap-y-5 px-4 pt-3">
              {gridAlbums.map((album) => (
                <li key={album.id}>
                  <AlbumCoverCard album={album} />
                </li>
              ))}
            </ul>
          )
        ) : needle ? (
          <ul className="grid grid-cols-3 gap-x-3 gap-y-5 px-4 pt-3">
            {searched.map((album) => (
              <li key={album.id}>
                <AlbumCoverCard album={album} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="pt-3">
            <section>
              <SectionTitle title="Terbaru" />
              <ul className="grid grid-cols-3 gap-x-3 gap-y-5 px-4">
                {terbaru.map((album, index) => (
                  <li key={album.id}>
                    <AlbumCoverCard album={album} eager={index < 6} />
                  </li>
                ))}
              </ul>
            </section>

            {lainnya.length > 0 ? (
              <section className="mt-8">
                <SectionTitle title="Album lainnya" href="/albums" />
                <div className="no-scrollbar flex gap-3 overflow-x-auto px-4">
                  {lainnya.map((album) => (
                    <div
                      key={album.id}
                      className="w-[calc((100vw-2rem-1.5rem)/3.28)] max-w-[11.75rem] shrink-0"
                    >
                      <AlbumCoverCard album={album} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-8">
              <SectionTitle title="Unggulan" />
              <ul className="grid grid-cols-3 gap-x-3 gap-y-5 px-4">
                <li>
                  <CollageCard
                    href="/tipe/terbaru"
                    title="Semua kenangan"
                    count={totals.items}
                    thumbnails={allThumbs}
                  />
                </li>
                {featured.map((group) => (
                  <li key={group.slug}>
                    <CollageCard
                      href={`/koleksi/${group.slug}`}
                      title={group.label}
                      count={group.itemCount}
                      thumbnails={group.thumbnails}
                    />
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-8 pb-6">
              <SectionTitle title="Tipe media" />
              <div className="mx-4 overflow-hidden rounded-[1.15rem] bg-paper-deep">
                {typeRows.map((row, index) => (
                  <MediaTypeRow
                    key={row.href}
                    href={row.href}
                    icon={row.icon}
                    label={row.label}
                    count={row.count}
                    last={index === typeRows.length - 1}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>

      <BottomDock />
    </div>
  );
}

"use client";

import { useCallback, useLayoutEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { MESSAGES } from "@/lib/errors";
import { formatDuration, formatFolderCount, formatItemCount } from "@/lib/format";
import {
  cacheClear,
  cacheGet,
  cacheIsFresh,
  cacheMediaList,
  cacheSet,
  libraryCacheKey,
  prefetchAlbum,
  warmMedia,
} from "@/lib/gallery-cache";
import { useLongPress } from "@/lib/use-long-press";
import { useScrollMemory } from "@/lib/use-scroll-memory";
import type {
  Album,
  AlbumCrumb,
  MediaItem,
  MediaListResponse,
  MediaType,
} from "@/lib/types";
import { AlbumCoverCard } from "@/components/AlbumCoverCard";
import { AppHeader } from "@/components/AppHeader";
import { ActionMenu, BottomDock, IconButton } from "@/components/Chrome";
import { useDownloadFlow } from "@/components/DownloadPopup";
import { IconCheck, IconChevron, IconDownload, IconLogout, IconPlay, IconRefresh, IconSort } from "@/components/Icons";
import { BusyLink, Spinner, ThumbImage } from "@/components/Loading";
import { EmptyState, ErrorState, MediaSkeleton } from "@/components/States";

type Filter = "all" | MediaType;

/** Jejak album induk, dari beranda sampai satu tingkat di atas album aktif. */
function Breadcrumb({ trail }: { trail: AlbumCrumb[] }) {
  return (
    <nav aria-label="Lokasi album" className="px-4 pb-2">
      <ol className="flex flex-wrap items-center gap-x-1 text-[13px] text-muted">
        <li>
          <BusyLink
            href="/"
            label="Membuka beranda"
            className="rounded px-0.5 py-0.5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Beranda
          </BusyLink>
        </li>
        {trail.map((crumb) => (
          <li key={crumb.id} className="flex min-w-0 items-center gap-1">
            <IconChevron className="h-3.5 w-3.5 shrink-0 opacity-60" />
            <BusyLink
              href={`/album/${crumb.id}`}
              label={`Membuka ${crumb.name}`}
              onPointerDown={() => void prefetchAlbum(crumb.id)}
              className="max-w-[9rem] truncate rounded px-0.5 py-0.5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {crumb.name}
            </BusyLink>
          </li>
        ))}
      </ol>
    </nav>
  );
}

type LibraryOptions = {
  title: string;
  type?: "image" | "video" | "gif";
  collection?: string;
  basePath?: string;
};

function MediaTile({
  item,
  href,
  eager,
  selectMode,
  selected,
  onToggle,
  onLongPress,
}: {
  item: MediaItem;
  href: string;
  eager: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onLongPress: () => void;
}) {
  const longPress = useLongPress(selectMode ? null : onLongPress);
  const duration =
    item.type === "video" && item.durationMs
      ? formatDuration(item.durationMs)
      : null;

  const inner = (
    <>
      <ThumbImage
        src={item.thumbnailUrl}
        alt={item.name}
        eager={eager}
        className="h-full w-full object-cover"
      />
      {item.type === "video" ? (
        <span className="absolute bottom-1 left-1 inline-flex items-center rounded-md bg-black/70 px-1 py-px text-[10px] font-medium tabular-nums text-white">
          {duration ?? <IconPlay className="h-3 w-3" />}
        </span>
      ) : null}
      {selectMode ? (
        <span
          className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full ${
            selected
              ? "bg-white text-black"
              : "bg-black/35 text-transparent ring-1 ring-white/80"
          }`}
        >
          <IconCheck className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </>
  );

  return (
    <li
      className="press-tile group relative aspect-square overflow-hidden bg-paper-deep"
      {...longPress}
    >
      {selectMode ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={selected}
          aria-label={`Pilih ${item.name}`}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {inner}
        </button>
      ) : (
        <BusyLink
          href={href}
          label="Membuka kenangan"
          onPointerDown={() => warmMedia(item)}
          onPointerEnter={() => warmMedia(item)}
          className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {inner}
        </BusyLink>
      )}
    </li>
  );
}

export function AlbumView({
  albumId,
  library,
}: {
  albumId?: string;
  library?: LibraryOptions;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const cacheKey = libraryCacheKey({
    albumId,
    type: library?.type,
    collection: library?.collection,
    filter: albumId ? filter : undefined,
  });
  const cached = cacheGet<MediaListResponse>(cacheKey);

  useScrollMemory(
    albumId
      ? `album:${albumId}:${filter}`
      : `lib:${library?.type ?? "all"}:${library?.collection ?? "all"}`,
  );

  const [album, setAlbum] = useState<Album | null>(
    cached?.album ?? (library ? { id: "library", name: library.title } : null),
  );
  const [subAlbums, setSubAlbums] = useState<Album[]>(cached?.subAlbums ?? []);
  const [breadcrumb, setBreadcrumb] = useState<AlbumCrumb[]>(
    cached?.breadcrumb ?? [],
  );
  const [items, setItems] = useState<MediaItem[]>(cached?.items ?? []);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>(
    cached?.nextPageToken,
  );
  const [total, setTotal] = useState<number | undefined>(cached?.total);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!cached);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const { download, downloading, popup } = useDownloadFlow();

  const load = useCallback(
    async (
      opts: { fresh?: boolean; pageToken?: string; append?: boolean } = {},
    ) => {
      const { fresh, pageToken, append } = opts;
      setError(null);
      const params = new URLSearchParams();
      if (albumId && filter !== "all") params.set("type", filter);
      if (pageToken) params.set("pageToken", pageToken);
      if (fresh) params.set("fresh", "1");
      if (library?.type) params.set("type", library.type);
      if (library?.collection) params.set("collection", library.collection);
      const query = params.toString();
      try {
        const path = albumId
          ? `/api/albums/${albumId}/media`
          : "/api/library/media";
        const data = await apiFetch<MediaListResponse>(
          `${path}${query ? `?${query}` : ""}`,
        );
        setAlbum(
          data.album ?? {
            id: "library",
            name: library?.title ?? "Album",
          },
        );
        if (!append) {
          setSubAlbums(data.subAlbums ?? []);
          setBreadcrumb(data.breadcrumb ?? []);
        }
        setItems((current) =>
          append ? [...current, ...data.items] : data.items,
        );
        setNextPageToken(data.nextPageToken);
        setTotal(data.total);
        if (!append) cacheSet(cacheKey, data);
        else cacheMediaList(data.items, albumId);
      } catch (err) {
        setError(userMessage(err));
      }
    },
    [albumId, cacheKey, filter, library?.collection, library?.title, library?.type],
  );

  useLayoutEffect(() => {
    setSelected(new Set());
    const existing = cacheGet<MediaListResponse>(cacheKey);
    if (existing) {
      setAlbum(
        existing.album ?? {
          id: "library",
          name: library?.title ?? "Album",
        },
      );
      setSubAlbums(existing.subAlbums ?? []);
      setBreadcrumb(existing.breadcrumb ?? []);
      setItems(existing.items);
      setNextPageToken(existing.nextPageToken);
      setTotal(existing.total);
      setLoading(false);
      if (cacheIsFresh(cacheKey)) return;
    } else {
      setLoading(true);
      setSubAlbums([]);
      setBreadcrumb([]);
      setItems([]);
    }
    void load({}).finally(() => setLoading(false));
  }, [cacheKey, library?.title, load]);

  async function refresh() {
    setRefreshing(true);
    await load({ fresh: true });
    setRefreshing(false);
  }

  async function logout() {
    cacheClear();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.replace("/login");
  }

  async function loadMore() {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    await load({ pageToken: nextPageToken, append: true });
    setLoadingMore(false);
  }

  /** Tekan-tahan sebuah media: masuk mode pilih dengan item itu sudah tertandai. */
  const startSelection = useCallback((id: string) => {
    setSelectMode(true);
    setSelected(new Set([id]));
  }, []);

  function toggleSelect(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadSelected() {
    const chosen = items.filter((item) => selected.has(item.id));
    if (chosen.length === 0 || downloading) return;
    const result = await download(chosen);
    if (result === "success") {
      setSelectMode(false);
      setSelected(new Set());
    }
  }

  const kind =
    library?.type === "image" || filter === "image"
      ? "foto"
      : library?.type === "video" || filter === "video"
        ? "video"
        : "item";
  const heading = library?.title ?? album?.name ?? "Album";
  const isTab =
    library?.type === "image" || library?.type === "video";
  const showDock = Boolean(library) && !selectMode;
  const ancestors = breadcrumb.slice(0, -1);
  const parentAlbumId = ancestors.at(-1)?.id;
  const mediaCount = total ?? items.length;
  const subtitle = loading
    ? "Memuat..."
    : [
        subAlbums.length > 0 ? formatFolderCount(subAlbums.length) : null,
        mediaCount > 0 || subAlbums.length === 0
          ? formatItemCount(mediaCount, kind)
          : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 ");
  const showFolders = subAlbums.length > 0 && !selectMode;
  const isEmpty = items.length === 0 && subAlbums.length === 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col bg-black">
      <AppHeader
        title={
          selectMode
            ? `${selected.size} dipilih`
            : heading
        }
        subtitle={selectMode ? undefined : subtitle}
        backHref={
          isTab ? undefined : parentAlbumId ? `/album/${parentAlbumId}` : "/"
        }
        large={isTab && !selectMode}
        actions={
          selectMode ? (
            <button
              type="button"
              onClick={() => {
                setSelectMode(false);
                setSelected(new Set());
              }}
              className="px-3 text-[15px] font-medium text-white"
            >
              Batal
            </button>
          ) : (
            <>
              {library ? null : (
                <IconButton label="Filter" onClick={() => setFilterOpen(true)}>
                  <IconSort className="h-[1.35rem] w-[1.35rem]" />
                </IconButton>
              )}
              <IconButton
                label="Pilih"
                onClick={() => {
                  setSelectMode(true);
                  setSelected(new Set());
                }}
              >
                <IconCheck className="h-5 w-5" />
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
          )
        }
      />

      <ActionMenu
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        items={[
          {
            id: "all",
            label: filter === "all" ? "Semua ✓" : "Semua",
            onClick: () => setFilter("all"),
          },
          {
            id: "image",
            label: filter === "image" ? "Foto ✓" : "Foto",
            onClick: () => setFilter("image"),
          },
          {
            id: "video",
            label: filter === "video" ? "Video ✓" : "Video",
            onClick: () => setFilter("video"),
          },
        ]}
      />

      {ancestors.length > 0 && !selectMode ? (
        <Breadcrumb trail={ancestors} />
      ) : null}

      <main className={`flex flex-1 flex-col ${showDock ? "pb-28" : "pb-8"}`}>
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => void load({ fresh: true })}
          />
        ) : loading && isEmpty ? (
          <MediaSkeleton />
        ) : isEmpty ? (
          <EmptyState
            message={
              library?.type === "video"
                ? "Belum ada video."
                : library?.type === "gif"
                  ? "Belum ada GIF."
                  : MESSAGES.albumEmpty
            }
          />
        ) : (
          <>
            {showFolders ? (
              <section className="px-4 pb-5 pt-1">
                <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-white">
                  Folder
                </h2>
                <ul className="grid grid-cols-3 gap-x-3 gap-y-5">
                  {subAlbums.map((sub) => (
                    <li key={sub.id}>
                      <AlbumCoverCard album={sub} />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <ul className="grid grid-cols-3 gap-px bg-black sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {items.map((item, index) => (
                <MediaTile
                  key={item.id}
                  item={item}
                  href={
                    library?.basePath
                      ? `${library.basePath}/${item.id}`
                      : item.albumId || albumId
                        ? `/album/${item.albumId ?? albumId}/${item.id}`
                        : `/m/${item.id}`
                  }
                  eager={index < 12}
                  selectMode={selectMode}
                  selected={selected.has(item.id)}
                  onToggle={() => toggleSelect(item.id)}
                  onLongPress={() => startSelection(item.id)}
                />
              ))}
            </ul>

            {nextPageToken ? (
              <div className="flex justify-center p-5">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="inline-flex min-h-11 items-center rounded-full bg-forest px-5 text-[15px] font-medium text-white hover:bg-forest-hover disabled:opacity-50"
                >
                  {loadingMore ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Memuat
                    </>
                  ) : (
                    "Muat lainnya"
                  )}
                </button>
              </div>
            ) : null}
          </>
        )}
      </main>

      {selectMode ? (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-black/90 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            type="button"
            onClick={() => void downloadSelected()}
            disabled={selected.size === 0 || downloading}
            className="mx-auto flex min-h-12 w-full max-w-lg items-center justify-center gap-2 rounded-full bg-white text-[16px] font-semibold text-black hover:bg-white/90 disabled:opacity-40"
          >
            <IconDownload className="h-5 w-5" />
            Download ({selected.size})
          </button>
        </div>
      ) : showDock ? (
        <BottomDock />
      ) : null}

      {popup}
    </div>
  );
}

"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { MESSAGES } from "@/lib/errors";
import { formatDuration, formatFolderCount, formatItemCount } from "@/lib/format";
import {
  appendCachedAlbumItems,
  cacheClear,
  cacheGet,
  cacheIsFresh,
  cachedAlbums,
  cacheMedia,
  cacheMediaList,
  cacheSet,
  libraryCacheKey,
  prefetchAlbum,
  videoNeedsTranscode,
  preloadOriginal,
  warmMedia,
} from "@/lib/gallery-cache";
import {
  browserNeedsVideoTranscode,
  prepareTranscodedPreview,
} from "@/lib/playback";
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
import { BusyLink, LoadingPanel, Spinner, ThumbImage, useBusy } from "@/components/Loading";
import { EmptyState, ErrorState } from "@/components/States";

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
  albumId,
  eager,
  selectMode,
  selected,
  onToggle,
  onLongPress,
}: {
  item: MediaItem;
  href: string;
  albumId?: string;
  eager: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggle: () => void;
  onLongPress: () => void;
}) {
  const { handlers, takeLongPress } = useLongPress(
    selectMode ? null : onLongPress,
  );
  const duration =
    item.type === "video" && item.durationMs
      ? formatDuration(item.durationMs)
      : null;

  function interceptClick(event: React.MouseEvent) {
    const afterLongPress = takeLongPress();
    if (!afterLongPress && !selectMode) return;
    event.preventDefault();
    event.stopPropagation();
    if (selectMode && !afterLongPress) onToggle();
  }

  function prepareOpen() {
    if (selectMode) return;
    cacheMedia(item, albumId ?? item.albumId);
    warmMedia(item);
    preloadOriginal(item);
  }

  /** Start convert early on press — not hover, to avoid locking the encode slot. */
  function prepareVideoOpen() {
    prepareOpen();
    if (
      item.type === "video" &&
      (browserNeedsVideoTranscode(item.mimeType) || videoNeedsTranscode(item.id))
    ) {
      void prepareTranscodedPreview(item.previewUrl);
    }
  }

  const inner = (
    <>
      <ThumbImage
        src={item.thumbnailUrl}
        remoteSrc={item.remoteThumbnailUrl}
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
      {...handlers}
      onClickCapture={interceptClick}
    >
      {/* Selalu tautan, bahkan di mode pilih: mengganti elemen di tengah tahanan
          membuat menu bawaan browser lolos. */}
      <BusyLink
        href={href}
        label="Membuka kenangan"
        role={selectMode ? "button" : undefined}
        aria-pressed={selectMode ? selected : undefined}
        aria-label={selectMode ? `Pilih ${item.name}` : undefined}
        onPointerDown={prepareVideoOpen}
        onPointerEnter={prepareOpen}
        className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {inner}
      </BusyLink>
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

  useScrollMemory(
    albumId
      ? `album:${albumId}:${filter}`
      : `lib:${library?.type ?? "all"}:${library?.collection ?? "all"}`,
  );

  // SSR-safe defaults; sessionStorage cache is applied in useLayoutEffect.
  const [album, setAlbum] = useState<Album | null>(
    library ? { id: "library", name: library.title } : null,
  );
  const [subAlbums, setSubAlbums] = useState<Album[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<AlbumCrumb[]>([]);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [total, setTotal] = useState<number | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const { download, downloading, popup } = useDownloadFlow();
  const { hide } = useBusy();
  const loadMoreLock = useRef(false);

  const load = useCallback(
    async (
      opts: {
        fresh?: boolean;
        pageToken?: string;
        append?: boolean;
      } = {},
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
        // Jangan hapus total album saat "muat lainnya" (halaman berikutnya tanpa total).
        setTotal((prev) =>
          data.total !== undefined ? data.total : append ? prev : undefined,
        );
        if (!append) cacheSet(cacheKey, data);
        else if (albumId) {
          appendCachedAlbumItems(albumId, data, filter);
        } else {
          cacheMediaList(data.items, albumId);
        }
        return data;
      } catch (err) {
        setError(userMessage(err));
        return null;
      }
    },
    [albumId, cacheKey, filter, library?.collection, library?.title, library?.type],
  );

  useLayoutEffect(() => {
    setSelected(new Set());
    const listAlbum = albumId
      ? cachedAlbums()?.find((entry) => entry.id === albumId)
      : undefined;
    // Kartu list punya total isi langsung; jangan dipakai saat filter foto/video.
    const listCount = filter === "all" ? listAlbum?.itemCount : undefined;
    const existing = cacheGet<MediaListResponse>(cacheKey);
    if (existing) {
      const seedAlbum = existing.album ?? listAlbum ?? {
        id: "library",
        name: library?.title ?? "Album",
      };
      setAlbum(seedAlbum);
      setSubAlbums(existing.subAlbums ?? []);
      setBreadcrumb(existing.breadcrumb ?? []);
      setItems(existing.items);
      setNextPageToken(existing.nextPageToken);
      // Cache lama: total sering = PAGE_SIZE (50) atau panjang halaman terakhir.
      const pageSizedTotal =
        Boolean(existing.nextPageToken) &&
        existing.total === existing.items.length;
      setTotal(
        pageSizedTotal
          ? (listCount ?? seedAlbum.itemCount ?? existing.total)
          : (existing.total ?? listCount ?? seedAlbum.itemCount),
      );
      setLoading(false);
      hide();
      const needsRecount =
        existing.total === undefined || pageSizedTotal;
      if (cacheIsFresh(cacheKey) && !needsRecount) return;
      void load({});
      return;
    }

    setLoading(true);
    setSubAlbums([]);
    setBreadcrumb([]);
    setItems([]);
    if (listAlbum) {
      setAlbum(listAlbum);
      if (listCount !== undefined) setTotal(listCount);
    }
    void load({})
      .catch(() => undefined)
      .finally(() => {
        setLoading(false);
        hide();
      });
  }, [albumId, cacheKey, filter, hide, library?.title, load]);

  async function refresh() {
    setRefreshing(true);
    try {
      await load({ fresh: true });
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    cacheClear();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.replace("/login");
  }

  async function loadMore() {
    if (!nextPageToken || loadingMore || loadMoreLock.current) return;
    loadMoreLock.current = true;
    setLoadingMore(true);
    try {
      await load({ pageToken: nextPageToken, append: true });
    } finally {
      setLoadingMore(false);
      loadMoreLock.current = false;
    }
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
  // Samakan dengan kartu list: total isi langsung album, bukan items yang sudah di-load.
  const mediaCount = total ?? album?.itemCount ?? items.length;
  const subtitle = loading
    ? "Memuat..."
    : subAlbums.length > 0
      ? `${formatFolderCount(subAlbums.length)} dan ${formatItemCount(mediaCount, kind)}`
      : formatItemCount(mediaCount, kind);
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
          <LoadingPanel
            label="Memuat album"
            hint="Mengambil kenangan dari Drive"
          />
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
                  albumId={albumId}
                  href={
                    library?.basePath
                      ? `${library.basePath}/${item.id}`
                      : item.albumId || albumId
                        ? `/album/${item.albumId ?? albumId}/${item.id}`
                        : `/m/${item.id}`
                  }
                  eager={index < 18}
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

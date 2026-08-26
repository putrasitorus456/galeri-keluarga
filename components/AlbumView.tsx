"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { MESSAGES } from "@/lib/errors";
import { formatDuration, formatItemCount } from "@/lib/format";
import {
  cacheClear,
  cacheGet,
  cacheMediaList,
  cacheSet,
  libraryCacheKey,
  prefetchLibrary,
} from "@/lib/gallery-cache";
import { downloadMedia, sleep } from "@/lib/share-download";
import type { Album, MediaItem, MediaListResponse, MediaType } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { ActionMenu, BottomDock, IconButton } from "@/components/Chrome";
import { IconCheck, IconDownload, IconLogout, IconPlay, IconRefresh, IconSort } from "@/components/Icons";
import { BusyLink, LoadingPanel, Spinner, ThumbImage, useBusy } from "@/components/Loading";
import { EmptyState, ErrorState } from "@/components/States";

type Filter = "all" | MediaType;

type LibraryOptions = {
  title: string;
  type?: "image" | "video" | "gif";
  collection?: string;
  basePath?: string;
};

export function AlbumView({
  albumId,
  library,
}: {
  albumId?: string;
  library?: LibraryOptions;
}) {
  const { show, hide } = useBusy();
  const [filter, setFilter] = useState<Filter>("all");
  const cacheKey = libraryCacheKey({
    albumId,
    type: library?.type,
    collection: library?.collection,
    filter: albumId ? filter : undefined,
  });
  const cached = cacheGet<MediaListResponse>(cacheKey);

  const [album, setAlbum] = useState<Album | null>(
    cached?.album ?? (library ? { id: "library", name: library.title } : null),
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
  const [downloading, setDownloading] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

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
        setItems((current) =>
          append ? [...current, ...data.items] : data.items,
        );
        setNextPageToken(data.nextPageToken);
        setTotal(data.total);
        if (!append) cacheSet(cacheKey, data);
        else cacheMediaList(data.items, albumId);
        if (library?.type === "image" || library?.type === "video") {
          void prefetchLibrary();
        }
        hide();
      } catch (err) {
        hide();
        setError(userMessage(err));
      }
    },
    [albumId, cacheKey, filter, hide, library?.collection, library?.title, library?.type],
  );

  useEffect(() => {
    const existing = cacheGet<MediaListResponse>(cacheKey);
    if (existing) {
      setAlbum(
        existing.album ?? {
          id: "library",
          name: library?.title ?? "Album",
        },
      );
      setItems(existing.items);
      setNextPageToken(existing.nextPageToken);
      setTotal(existing.total);
      setLoading(false);
      hide();
    } else {
      setLoading(true);
      setItems([]);
      show(library?.title ? `Memuat ${library.title}` : "Memuat album");
    }
    setSelected(new Set());
    void load({}).finally(() => setLoading(false));
  }, [cacheKey, hide, library?.title, load, show]);

  async function refresh() {
    setRefreshing(true);
    show("Memuat ulang");
    await load({ fresh: true });
    setRefreshing(false);
  }

  async function logout() {
    show("Keluar");
    cacheClear();
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.replace("/login");
  }

  async function loadMore() {
    if (!nextPageToken || loadingMore) return;
    setLoadingMore(true);
    show("Memuat lainnya");
    await load({ pageToken: nextPageToken, append: true });
    setLoadingMore(false);
  }

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
    if (chosen.length === 0) return;
    setDownloading(true);
    show("Mengunduh");
    try {
      for (const item of chosen) {
        await downloadMedia(item);
        await sleep(700);
      }
      setSelectMode(false);
      setSelected(new Set());
    } finally {
      hide();
      setDownloading(false);
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
  const subtitle = loading
    ? "Memuat..."
    : formatItemCount(total ?? items.length, kind);

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col bg-black">
      <AppHeader
        title={
          selectMode
            ? `${selected.size} dipilih`
            : heading
        }
        subtitle={selectMode ? undefined : subtitle}
        backHref={isTab ? undefined : "/"}
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

      <main className={`flex flex-1 flex-col ${showDock ? "pb-28" : "pb-8"}`}>
        {error ? (
          <ErrorState
            message={error}
            onRetry={() => void load({ fresh: true })}
          />
        ) : loading && items.length === 0 ? (
          <LoadingPanel label="Memuat kenangan" />
        ) : items.length === 0 ? (
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
            <ul className="grid grid-cols-3 gap-px bg-black sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7">
              {items.map((item) => {
                const isSelected = selected.has(item.id);
                const duration =
                  item.type === "video" && item.durationMs
                    ? formatDuration(item.durationMs)
                    : null;
                const inner = (
                  <>
                    <ThumbImage
                      src={item.thumbnailUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                    {item.type === "video" ? (
                      <span className="absolute bottom-1 left-1 inline-flex items-center rounded-md bg-black/70 px-1 py-px text-[10px] font-medium tabular-nums text-white">
                        {duration ?? (
                          <IconPlay className="h-3 w-3" />
                        )}
                      </span>
                    ) : null}
                    {selectMode ? (
                      <span
                        className={`absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full ${
                          isSelected
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
                    key={item.id}
                    className="group relative aspect-square overflow-hidden bg-paper-deep"
                  >
                    {selectMode ? (
                      <button
                        type="button"
                        onClick={() => toggleSelect(item.id)}
                        aria-pressed={isSelected}
                        aria-label={`Pilih ${item.name}`}
                        className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        {inner}
                      </button>
                    ) : (
                      <BusyLink
                        href={
                          library?.basePath
                            ? `${library.basePath}/${item.id}`
                            : item.albumId || albumId
                              ? `/album/${item.albumId ?? albumId}/${item.id}`
                              : `/m/${item.id}`
                        }
                        label="Membuka kenangan"
                        className="absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                      >
                        {inner}
                      </BusyLink>
                    )}
                  </li>
                );
              })}
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
            {downloading ? <Spinner size="sm" tone="dark" /> : <IconDownload className="h-5 w-5" />}
            {downloading ? "Mengunduh" : `Download (${selected.size})`}
          </button>
        </div>
      ) : showDock ? (
        <BottomDock />
      ) : null}
    </div>
  );
}

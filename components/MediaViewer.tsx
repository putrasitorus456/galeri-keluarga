"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, userMessage } from "@/lib/api-client";
import {
  appendCachedAlbumItems,
  cacheGet,
  cacheMedia,
  cacheSet,
  cachedAlbums,
  findCachedAlbumList,
  getCachedMedia,
  libraryCacheKey,
  warmMedia,
} from "@/lib/gallery-cache";
import { shareMedia } from "@/lib/share-download";
import type {
  LibraryKind,
  MediaItem,
  MediaListResponse,
  MediaMetaResponse,
} from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { IconButton } from "@/components/Chrome";
import { useDownloadFlow } from "@/components/DownloadPopup";
import { IconChevron, IconDownload, IconShare } from "@/components/Icons";
import { MediaFilmstrip } from "@/components/MediaFilmstrip";
import { MediaStage } from "@/components/MediaStage";
import { Spinner, useBusy } from "@/components/Loading";
import { ErrorState } from "@/components/States";

const SWIPE_PX = 56;
const SLIDE_MS = 240;

export type ViewerLibrary = {
  title: string;
  basePath: string;
  type?: LibraryKind;
  collection?: string;
};

export function MediaViewer({
  albumId,
  mediaId,
  library,
}: {
  albumId?: string;
  mediaId: string;
  library?: ViewerLibrary;
}) {
  const router = useRouter();
  const { show, hide } = useBusy();
  const basePath = library?.basePath ?? `/album/${albumId}`;
  const isLibrary = Boolean(library);
  const libraryKey = library
    ? libraryCacheKey({ type: library.type, collection: library.collection })
    : undefined;

  const cachedAlbumList =
    !library && albumId ? findCachedAlbumList(albumId, mediaId) : undefined;
  const cachedList =
    cachedAlbumList ??
    (libraryKey ? cacheGet<MediaListResponse>(libraryKey) : undefined);

  const [currentId, setCurrentId] = useState(mediaId);
  const [media, setMedia] = useState<MediaItem | null>(
    () =>
      getCachedMedia(mediaId)?.media ??
      cachedList?.items.find((item) => item.id === mediaId) ??
      null,
  );
  const [items, setItems] = useState<MediaItem[]>(cachedList?.items ?? []);
  const [albumName, setAlbumName] = useState(cachedAlbumList?.album?.name);
  const [listFilter, setListFilter] = useState<"all" | "image" | "video">(
    cachedAlbumList?.filter ?? "all",
  );
  const [nextPageToken, setNextPageToken] = useState(
    cachedAlbumList?.nextPageToken,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"share" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { download, downloading, popup } = useDownloadFlow();
  const [dragX, setDragX] = useState(0);
  const [slide, setSlide] = useState(0);
  const [animating, setAnimating] = useState(false);
  const loadingMore = useRef(false);
  const pendingTo = useRef<string | null>(null);
  const openedId = useRef(mediaId);
  const drag = useRef({
    tracking: false,
    captured: false,
    startX: 0,
    startY: 0,
    axis: null as "h" | "v" | null,
    x: 0,
  });

  const index = useMemo(
    () => items.findIndex((item) => item.id === currentId),
    [items, currentId],
  );
  const prevItem = index > 0 ? items[index - 1] : undefined;
  const nextItem = index >= 0 ? items[index + 1] : undefined;
  const currentItem = (index >= 0 ? items[index] : undefined) ?? media;

  const commit = useCallback(
    (id: string) => {
      pendingTo.current = null;
      setCurrentId(id);
      setNotice(null);
      setDragX(0);
      setSlide(0);
      setAnimating(false);
      router.replace(`${basePath}/${id}`, { scroll: false });
    },
    [basePath, router],
  );

  const startSlide = useCallback((direction: -1 | 1, id: string) => {
    pendingTo.current = id;
    setAnimating(true);
    window.requestAnimationFrame(() => {
      setDragX(0);
      setSlide(direction);
    });
  }, []);

  const goTo = useCallback(
    (id: string) => {
      if (!id || id === currentId) return;
      if (!animating && prevItem?.id === id) startSlide(-1, id);
      else if (!animating && nextItem?.id === id) startSlide(1, id);
      else commit(id);
    },
    [animating, commit, currentId, nextItem?.id, prevItem?.id, startSlide],
  );

  useEffect(() => {
    if (!animating) return;
    const timer = window.setTimeout(() => {
      const id = pendingTo.current;
      pendingTo.current = null;
      if (id) commit(id);
      else {
        setAnimating(false);
        setSlide(0);
        setDragX(0);
      }
    }, SLIDE_MS + 40);
    return () => window.clearTimeout(timer);
  }, [animating, commit]);

  useEffect(() => {
    openedId.current = mediaId;
    setCurrentId(mediaId);
  }, [mediaId]);

  useLayoutEffect(() => {
    const list =
      (!library && albumId ? findCachedAlbumList(albumId, currentId) : undefined) ??
      (libraryKey ? cacheGet<MediaListResponse>(libraryKey) : undefined);
    if (list?.items.length) {
      setItems(list.items);
      if (list.album?.name) setAlbumName(list.album.name);
    }
    const hit = getCachedMedia(currentId);
    const fromList = list?.items.find((item) => item.id === currentId);
    const seed = hit?.media ?? fromList;
    if (seed) setMedia(seed);
  }, [albumId, currentId, library, libraryKey]);

  useEffect(() => {
    let cancelled = false;

    if (libraryKey) {
      const existing = cacheGet<MediaListResponse>(libraryKey);
      if (existing?.items.length) {
        setItems(existing.items);
        setNextPageToken(undefined);
        return;
      }
      const params = new URLSearchParams();
      if (library?.type) params.set("type", library.type);
      if (library?.collection) params.set("collection", library.collection);
      const query = params.toString();
      void apiFetch<MediaListResponse>(
        `/api/library/media${query ? `?${query}` : ""}`,
      )
        .then((data) => {
          if (cancelled) return;
          cacheSet(libraryKey, data);
          setItems(data.items);
        })
        .catch(() => {
          /* filmstrip is optional if the list cannot be loaded */
        });
      return () => {
        cancelled = true;
      };
    }

    if (!albumId) return;
    const found = findCachedAlbumList(albumId, openedId.current);
    if (found) {
      setItems(found.items);
      setAlbumName(found.album?.name);
      setNextPageToken(found.nextPageToken);
      setListFilter(found.filter);
      return;
    }
    void apiFetch<MediaListResponse>(`/api/albums/${albumId}/media`)
      .then((data) => {
        if (cancelled) return;
        cacheSet(libraryCacheKey({ albumId, filter: "all" }), data);
        setItems(data.items);
        setAlbumName(data.album?.name);
        setNextPageToken(data.nextPageToken);
        setListFilter("all");
      })
      .catch(() => {
        /* filmstrip is optional if the album list cannot be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, [albumId, library?.collection, library?.type, libraryKey]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const hit = getCachedMedia(currentId);
    const fromList = items.find((item) => item.id === currentId);
    const seed = hit?.media ?? fromList;
    if (seed) {
      if (!isLibrary && hit?.albumId && hit.albumId !== albumId) {
        router.replace(`/album/${hit.albumId}/${currentId}`);
        return;
      }
      setMedia(seed);
      return;
    }

    void apiFetch<MediaMetaResponse>(`/api/media/${currentId}`)
      .then((data) => {
        if (cancelled) return;
        if (!isLibrary && data.albumId !== albumId) {
          router.replace(`/album/${data.albumId}/${currentId}`);
          return;
        }
        cacheMedia(data.media, data.albumId);
        setMedia(data.media);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(userMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [albumId, currentId, isLibrary, items, router]);

  useEffect(() => {
    if (!media) return;
    setItems((current) => {
      if (current.some((item) => item.id === media.id)) return current;
      return [media, ...current];
    });
  }, [media]);

  useEffect(() => {
    const neighbors = [items[index], items[index - 1], items[index + 1]];
    for (const item of neighbors) {
      if (item) warmMedia(item);
    }
  }, [index, items]);

  useEffect(() => {
    if (!albumId || isLibrary) return;
    if (!nextPageToken || loadingMore.current || index < 0) return;
    if (index < items.length - 4) return;
    let cancelled = false;
    loadingMore.current = true;
    const params = new URLSearchParams({ pageToken: nextPageToken });
    if (listFilter === "image" || listFilter === "video") {
      params.set("type", listFilter);
    }
    void apiFetch<MediaListResponse>(`/api/albums/${albumId}/media?${params}`)
      .then((data) => {
        if (cancelled) return;
        const merged = appendCachedAlbumItems(albumId, data, listFilter);
        setItems(merged.items);
        setNextPageToken(merged.nextPageToken);
      })
      .catch(() => {
        /* keep the already loaded pages */
      })
      .finally(() => {
        loadingMore.current = false;
      });
    return () => {
      cancelled = true;
    };
  }, [albumId, index, isLibrary, items.length, listFilter, nextPageToken]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft" && prevItem) goTo(prevItem.id);
      if (event.key === "ArrowRight" && nextItem) goTo(nextItem.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, nextItem, prevItem]);

  function finishSwipe(to: -1 | 0 | 1) {
    const target = to === -1 ? prevItem : to === 1 ? nextItem : undefined;
    if (target && to !== 0) {
      startSlide(to, target.id);
      return;
    }
    pendingTo.current = null;
    setAnimating(true);
    window.requestAnimationFrame(() => {
      setSlide(0);
      setDragX(0);
    });
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || animating) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    const video = target.closest("video");
    if (video) {
      const rect = video.getBoundingClientRect();
      if (event.clientY > rect.bottom - 72) return;
    }
    drag.current = {
      tracking: true,
      captured: false,
      startX: event.clientX,
      startY: event.clientY,
      axis: null,
      x: 0,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current.tracking) return;
    const dx = event.clientX - drag.current.startX;
    const dy = event.clientY - drag.current.startY;
    if (!drag.current.axis && Math.hypot(dx, dy) > 8) {
      drag.current.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
    if (drag.current.axis !== "h") return;
    if (!drag.current.captured) {
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current.captured = true;
    }
    event.preventDefault();
    const limited =
      (dx > 0 && !prevItem) || (dx < 0 && !nextItem) ? dx * 0.28 : dx;
    drag.current.x = limited;
    setDragX(limited);
  }

  function onPointerUp() {
    if (!drag.current.tracking) return;
    drag.current.tracking = false;
    drag.current.captured = false;
    if (drag.current.axis !== "h") {
      setDragX(0);
      return;
    }
    const dx = drag.current.x;
    if (dx > SWIPE_PX && prevItem) finishSwipe(-1);
    else if (dx < -SWIPE_PX && nextItem) finishSwipe(1);
    else finishSwipe(0);
  }

  async function onDownload() {
    if (!currentItem || downloading || busy) return;
    setNotice(null);
    await download([currentItem]);
  }

  async function onShare() {
    if (!currentItem) return;
    setBusy("share");
    setNotice(null);
    show("Membagikan");
    const result = await shareMedia(currentItem);
    if (result === "copied") setNotice("Tautan disalin.");
    if (result === "failed") setNotice("Tautan tidak dapat dibagikan.");
    hide();
    setBusy(null);
  }

  const heading =
    library?.title ??
    albumName ??
    cachedAlbums()?.find((album) => album.id === albumId)?.name ??
    "Album";
  const position =
    index >= 0 && items.length > 1
      ? `${index + 1} dari ${items.length}`
      : undefined;
  const kindLabel = currentItem?.type === "video" ? "Video" : "Foto";
  const subtitle = currentItem
    ? position
      ? `${kindLabel} · ${position}`
      : kindLabel
    : undefined;

  return (
    <div className="mx-auto flex h-dvh max-w-5xl flex-col overflow-hidden bg-black">
      <AppHeader
        title={heading}
        subtitle={subtitle}
        backHref={basePath}
        actions={
          currentItem ? (
            <>
              <IconButton
                label={downloading ? "Mengunduh..." : "Download"}
                onClick={() => void onDownload()}
                disabled={busy !== null || downloading}
              >
                <IconDownload className="h-5 w-5" />
              </IconButton>
              <IconButton
                label={busy === "share" ? "Membagikan..." : "Bagikan"}
                onClick={() => void onShare()}
                disabled={busy !== null || downloading}
              >
                {busy === "share" ? (
                  <Spinner size="sm" />
                ) : (
                  <IconShare className="h-5 w-5" />
                )}
              </IconButton>
            </>
          ) : null
        }
      />

      <main className="flex min-h-0 flex-1 flex-col">
        {error ? (
          <ErrorState message={error} />
        ) : !currentItem ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            <div
              className="relative min-h-0 flex-1 select-none overflow-hidden"
              style={{ overscrollBehaviorX: "contain", touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <div
                className={`absolute inset-y-0 left-0 flex w-[300%] ${
                  animating ? "media-track" : ""
                }`}
                style={{
                  transform: `translate3d(calc(-33.333% + ${-slide * 33.333}% + ${dragX}px), 0, 0)`,
                }}
              >
                <div className="h-full w-1/3">
                  {prevItem ? (
                    <MediaStage key={prevItem.id} item={prevItem} active={false} />
                  ) : null}
                </div>
                <div className="h-full w-1/3">
                  <MediaStage key={currentItem.id} item={currentItem} active />
                </div>
                <div className="h-full w-1/3">
                  {nextItem ? (
                    <MediaStage key={nextItem.id} item={nextItem} active={false} />
                  ) : null}
                </div>
              </div>

              {prevItem ? (
                <button
                  type="button"
                  aria-label="Foto sebelumnya"
                  onClick={() => goTo(prevItem.id)}
                  className="absolute left-1 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70 md:flex"
                >
                  <IconChevron className="h-6 w-6 rotate-180" />
                </button>
              ) : null}
              {nextItem ? (
                <button
                  type="button"
                  aria-label="Foto berikutnya"
                  onClick={() => goTo(nextItem.id)}
                  className="absolute right-1 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/70 md:flex"
                >
                  <IconChevron className="h-6 w-6" />
                </button>
              ) : null}
            </div>

            {notice ? (
              <p className="shrink-0 px-3 pt-2 text-center text-[15px] text-muted" role="status">
                {notice}
              </p>
            ) : null}

            <MediaFilmstrip
              items={items}
              currentId={currentId}
              onSelect={goTo}
            />
          </>
        )}
      </main>

      {popup}
    </div>
  );
}

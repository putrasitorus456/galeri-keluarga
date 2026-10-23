"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCachedPreviewUrl,
  markMediaOpened,
  markVideoNeedsTranscode,
  videoNeedsTranscode,
  wasMediaOpened,
} from "@/lib/gallery-cache";
import {
  browserNeedsVideoTranscode,
  prepareTranscodedPreview,
  transcodedFileUrl,
} from "@/lib/playback";
import type { MediaItem } from "@/lib/types";
import { useDownloadFlow } from "@/components/DownloadPopup";
import { IconDownload } from "@/components/Icons";
import { LoadingMark, Spinner, StatusCopy } from "@/components/Loading";

export function MediaStage({
  item,
  active,
  onPlaybackReady,
}: {
  item: MediaItem;
  active: boolean;
  onPlaybackReady?: () => void;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {item.type === "video" ? (
        <VideoStage
          item={item}
          active={active}
          onPlaybackReady={onPlaybackReady}
        />
      ) : (
        <ImageStage
          item={item}
          active={active}
          onPlaybackReady={onPlaybackReady}
        />
      )}
    </div>
  );
}

function Overlay({
  thumbnailUrl,
  children,
}: {
  thumbnailUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
      {thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt=""
          className="h-full w-full object-contain opacity-50"
        />
      ) : null}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
        {children}
      </div>
    </div>
  );
}

function useDelayedFlag(on: boolean, delayMs = 480) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!on) {
      setShown(false);
      return;
    }
    const timer = window.setTimeout(() => setShown(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [on, delayMs]);
  return shown;
}

type VideoSource = "original" | "converted" | "failed";

function initialVideoSource(item: MediaItem): VideoSource {
  if (videoNeedsTranscode(item.id) || browserNeedsVideoTranscode(item.mimeType)) {
    return "converted";
  }
  return "original";
}

function VideoStage({
  item,
  active,
  onPlaybackReady,
}: {
  item: MediaItem;
  active: boolean;
  onPlaybackReady?: () => void;
}) {
  const { download, downloading, popup } = useDownloadFlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const convertedErrors = useRef(0);
  const notifiedReady = useRef(false);
  const [source, setSource] = useState<VideoSource>(() =>
    active ? initialVideoSource(item) : "original",
  );
  const [ready, setReady] = useState(() => !active || wasMediaOpened(item.id));
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(
    active && source !== "failed" && !ready,
    source === "converted" ? 0 : 480,
  );

  useEffect(() => {
    convertedErrors.current = 0;
    notifiedReady.current = false;
    setSource(active ? initialVideoSource(item) : "original");
    setReady(!active || wasMediaOpened(item.id));
    setConvertedUrl(null);
  }, [active, item.id, item.mimeType, item.previewUrl]);

  useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active]);

  useEffect(() => {
    if (!active || source !== "converted" || convertedUrl) return;

    let cancelled = false;
    setReady(false);

    void prepareTranscodedPreview(item.previewUrl)
      .then(() => {
        if (cancelled) return;
        setConvertedUrl(transcodedFileUrl(item.previewUrl));
      })
      .catch(() => {
        if (cancelled) return;
        setSource("failed");
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [active, convertedUrl, item.previewUrl, source]);

  function markReady() {
    setReady(true);
    markMediaOpened(item.id);
    if (!notifiedReady.current) {
      notifiedReady.current = true;
      onPlaybackReady?.();
    }
  }

  function handleError() {
    if (!active) return;
    if (source === "original") {
      markVideoNeedsTranscode(item.id);
      convertedErrors.current = 0;
      setSource("converted");
      setConvertedUrl(null);
      setReady(false);
      return;
    }
    if (convertedErrors.current < 2) {
      convertedErrors.current += 1;
      setConvertedUrl(null);
      setReady(false);
      return;
    }
    setSource("failed");
    setReady(true);
  }

  function retry() {
    convertedErrors.current = 0;
    setSource(initialVideoSource(item));
    setConvertedUrl(null);
    setReady(false);
  }

  if (!active) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.thumbnailUrl}
        alt=""
        draggable={false}
        className="h-full w-full bg-black object-contain"
      />
    );
  }

  if (source === "failed") {
    return (
      <>
        <Overlay thumbnailUrl={item.thumbnailUrl}>
          <p className="max-w-sm text-center text-[15px] font-medium tracking-tight text-white/90">
            Video ini tidak dapat diputar di perangkat Anda.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={retry}
              className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[15px] font-medium text-black transition hover:bg-white/90"
            >
              Coba lagi
            </button>
            <button
              type="button"
              onClick={() => void download([item], { transcoded: true })}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[15px] font-medium text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
            >
              <IconDownload className="h-4 w-4" />
              Unduh video
            </button>
          </div>
        </Overlay>
        {popup}
      </>
    );
  }

  const src =
    source === "converted" ? convertedUrl : active ? item.previewUrl : null;

  return (
    <>
      {showSpinner || !src ? (
        <Overlay thumbnailUrl={item.thumbnailUrl}>
          {active ? (
            <>
              <LoadingMark size="lg" />
              <StatusCopy
                label={
                  source === "converted"
                    ? "Menyiapkan video"
                    : "Memuat pratinjau"
                }
                hint="Mohon tunggu sebentar"
              />
            </>
          ) : null}
        </Overlay>
      ) : null}
      {src ? (
        <video
          key={src}
          ref={videoRef}
          controls={active && ready}
          playsInline
          preload="auto"
          poster={item.thumbnailUrl}
          className={`h-full w-full bg-black object-contain ${
            ready ? "opacity-100" : "opacity-0"
          }`}
          src={src}
          onCanPlay={markReady}
          onLoadedData={markReady}
          onError={handleError}
        >
          Browser Anda tidak dapat memutar video ini.
        </video>
      ) : null}
      {popup}
    </>
  );
}

function mediaFileUrl(item: MediaItem) {
  return item.fileUrl || `/api/media/${item.id}/file`;
}

/** Offset pojok kanan-atas isi foto di dalam elemen `object-contain`. */
function containContentInset(img: HTMLImageElement) {
  const { clientWidth: cw, clientHeight: ch, naturalWidth: nw, naturalHeight: nh } =
    img;
  if (!cw || !ch || !nw || !nh) return null;
  const scale = Math.min(cw / nw, ch / nh);
  const drawnW = nw * scale;
  const drawnH = nh * scale;
  return {
    top: (ch - drawnH) / 2,
    right: (cw - drawnW) / 2,
  };
}

function ImageStage({
  item,
  active,
  onPlaybackReady,
}: {
  item: MediaItem;
  active: boolean;
  onPlaybackReady?: () => void;
}) {
  const notifiedReady = useRef(false);
  const frameRef = useRef<HTMLImageElement>(null);
  const cached = getCachedPreviewUrl(item.id);
  const [previewSrc, setPreviewSrc] = useState<string | null>(
    () => cached ?? (active ? item.previewUrl : null),
  );
  const [previewReady, setPreviewReady] = useState(
    () => Boolean(cached) || wasMediaOpened(item.id),
  );
  const [fullSrc, setFullSrc] = useState<string | null>(
    () => (active ? mediaFileUrl(item) : null),
  );
  const [fullReady, setFullReady] = useState(false);
  const [badgeInset, setBadgeInset] = useState<{ top: number; right: number } | null>(
    null,
  );
  const showOpenSpinner = useDelayedFlag(active && !previewReady, 280);
  const showHdBadge = useDelayedFlag(
    active && previewReady && Boolean(fullSrc) && !fullReady,
    400,
  );

  useEffect(() => {
    notifiedReady.current = false;
    setFullReady(false);

    const blobUrl = getCachedPreviewUrl(item.id);
    if (blobUrl) {
      setPreviewSrc(blobUrl);
      setPreviewReady(true);
      markMediaOpened(item.id);
    } else if (active) {
      setPreviewSrc(item.previewUrl);
      setPreviewReady(wasMediaOpened(item.id));
    } else {
      setPreviewSrc(null);
      setPreviewReady(false);
    }

    // File asli hanya untuk slide aktif — tetangga cukup pratinjau.
    setFullSrc(active ? mediaFileUrl(item) : null);
  }, [active, item, item.id, item.previewUrl, item.fileUrl]);

  useEffect(() => {
    if (!active || !previewReady || notifiedReady.current) return;
    notifiedReady.current = true;
    onPlaybackReady?.();
  }, [active, previewReady, onPlaybackReady]);

  useEffect(() => {
    const img = frameRef.current;
    if (!img || !showHdBadge) {
      setBadgeInset(null);
      return;
    }

    function measure() {
      const el = frameRef.current;
      if (!el) return;
      const inset = containContentInset(el);
      if (inset) setBadgeInset(inset);
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(img);
    img.addEventListener("load", measure);
    return () => {
      ro.disconnect();
      img.removeEventListener("load", measure);
    };
  }, [showHdBadge, previewSrc, item.thumbnailUrl, previewReady]);

  function markPreviewReady() {
    setPreviewReady(true);
    markMediaOpened(item.id);
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={frameRef}
        src={item.thumbnailUrl}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-contain"
      />
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt={item.name}
          draggable={false}
          className={`absolute inset-0 h-full w-full object-contain ${
            previewReady ? "opacity-100" : "opacity-0"
          }`}
          fetchPriority={active && !fullReady ? "high" : "low"}
          decoding="async"
          onLoad={markPreviewReady}
          onError={markPreviewReady}
        />
      ) : null}
      {fullSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fullSrc}
          alt={item.name}
          draggable={false}
          className={`relative h-full w-full object-contain ${
            fullReady ? "opacity-100" : "opacity-0"
          }`}
          fetchPriority={active ? "high" : "low"}
          decoding="async"
          onLoad={() => setFullReady(true)}
          onError={() => setFullReady(true)}
        />
      ) : null}
      {showOpenSpinner ? (
        <Overlay thumbnailUrl={item.thumbnailUrl}>
          <LoadingMark size="lg" />
          <StatusCopy label="Memuat foto" hint="Mohon tunggu sebentar" />
        </Overlay>
      ) : null}
      {showHdBadge && badgeInset ? (
        <div
          className="pointer-events-none absolute z-20"
          style={{
            top: badgeInset.top + 8,
            right: badgeInset.right + 8,
          }}
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2.5 py-1.5 text-[12px] font-medium tracking-tight text-white shadow-lg backdrop-blur-sm">
            <Spinner size="sm" />
            Memuat HD
          </span>
        </div>
      ) : null}
    </>
  );
}

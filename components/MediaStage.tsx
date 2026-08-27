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
import { Spinner, StatusCopy } from "@/components/Loading";

export function MediaStage({
  item,
  active,
}: {
  item: MediaItem;
  active: boolean;
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {item.type === "video" ? (
        <VideoStage item={item} active={active} />
      ) : (
        <ImageStage item={item} active={active} />
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

function VideoStage({ item, active }: { item: MediaItem; active: boolean }) {
  const { download, downloading, popup } = useDownloadFlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const convertedErrors = useRef(0);
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
              <Spinner size="lg" />
              <StatusCopy
                label={
                  source === "converted"
                    ? "Menyiapkan video"
                    : "Memuat pratinjau"
                }
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

function ImageStage({ item, active }: { item: MediaItem; active: boolean }) {
  const cached = getCachedPreviewUrl(item.id);
  const [hiRes, setHiRes] = useState<string | null>(
    () => cached ?? (active ? item.previewUrl : null),
  );
  const [hiReady, setHiReady] = useState(
    () => Boolean(cached) || wasMediaOpened(item.id),
  );

  useEffect(() => {
    const blobUrl = getCachedPreviewUrl(item.id);
    if (blobUrl) {
      setHiRes(blobUrl);
      setHiReady(true);
      markMediaOpened(item.id);
      return;
    }
    if (active) setHiRes(item.previewUrl);
  }, [active, item.id, item.previewUrl]);

  const previewSrc = hiRes;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
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
          className={`relative h-full w-full object-contain ${
            hiReady ? "opacity-100" : "opacity-0"
          }`}
          fetchPriority={active ? "high" : "low"}
          decoding="async"
          onLoad={() => {
            setHiReady(true);
            markMediaOpened(item.id);
          }}
          onError={() => setHiReady(true)}
        />
      ) : null}
    </>
  );
}

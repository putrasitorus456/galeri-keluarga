"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCachedPreviewUrl,
  markMediaOpened,
  markVideoNeedsTranscode,
  videoNeedsTranscode,
  wasMediaOpened,
} from "@/lib/gallery-cache";
import { browserNeedsVideoTranscode } from "@/lib/playback";
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
  const [source, setSource] = useState<VideoSource>(() => initialVideoSource(item));
  const [ready, setReady] = useState(() => !active || wasMediaOpened(item.id));
  const showSpinner = useDelayedFlag(active && !ready);

  useEffect(() => {
    setSource(initialVideoSource(item));
    setReady(!active || wasMediaOpened(item.id));
  }, [active, item]);

  useEffect(() => {
    if (!active) videoRef.current?.pause();
  }, [active]);

  function handleError() {
    if (source === "original") {
      markVideoNeedsTranscode(item.id);
      setSource("converted");
      setReady(false);
      return;
    }
    setSource("failed");
    setReady(true);
  }

  if (source === "failed") {
    return (
      <>
        <Overlay thumbnailUrl={item.thumbnailUrl}>
          <p className="max-w-sm text-center text-[15px] font-medium tracking-tight text-white/90">
            Video ini tidak dapat diputar di perangkat Anda.
          </p>
          <button
            type="button"
            onClick={() => void download([item], { transcoded: true })}
            disabled={downloading}
            className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[15px] font-medium text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
          >
            <IconDownload className="h-4 w-4" />
            Unduh video
          </button>
        </Overlay>
        {popup}
      </>
    );
  }

  const src =
    source === "converted" ? `${item.previewUrl}?transcode=1` : item.previewUrl;

  return (
    <>
      {showSpinner ? (
        <Overlay thumbnailUrl={item.thumbnailUrl}>
          <Spinner size="lg" />
          <StatusCopy
            label={
              source === "converted"
                ? "Menyiapkan video"
                : "Memuat pratinjau"
            }
          />
        </Overlay>
      ) : null}
      <video
        key={source}
        ref={videoRef}
        controls={active}
        playsInline
        preload={active || wasMediaOpened(item.id) ? "auto" : "metadata"}
        poster={item.thumbnailUrl}
        className="h-full w-full bg-black object-contain"
        src={src}
        onCanPlay={() => {
          setReady(true);
          markMediaOpened(item.id);
        }}
        onLoadedData={() => {
          setReady(true);
          markMediaOpened(item.id);
        }}
        onError={handleError}
      >
        Browser Anda tidak dapat memutar video ini.
      </video>
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

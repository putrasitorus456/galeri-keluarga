"use client";

import { useEffect, useRef, useState } from "react";
import {
  getCachedPreviewUrl,
  markMediaOpened,
  markVideoNeedsTranscode,
  rememberPreview,
  videoNeedsTranscode,
  wasMediaOpened,
} from "@/lib/gallery-cache";
import { downloadMedia } from "@/lib/share-download";
import type { MediaItem } from "@/lib/types";
import { Spinner, StatusCopy } from "@/components/Loading";
import { IconDownload } from "@/components/Icons";

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

/**
 * Source order for video. Most clips play straight from Drive, but iPhone .MOV
 * recordings are HEVC, which only Safari can decode. When the browser rejects
 * the original we retry against the server-side H.264 conversion.
 */
type VideoSource = "original" | "converted" | "failed";

function VideoStage({ item, active }: { item: MediaItem; active: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<VideoSource>(() =>
    videoNeedsTranscode(item.id) ? "converted" : "original",
  );
  const [ready, setReady] = useState(() => !active || wasMediaOpened(item.id));

  useEffect(() => {
    setSource(videoNeedsTranscode(item.id) ? "converted" : "original");
    setReady(!active || wasMediaOpened(item.id));
  }, [active, item.id]);

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
      <Overlay thumbnailUrl={item.thumbnailUrl}>
        <p className="max-w-sm text-center text-[15px] font-medium tracking-tight text-white/90">
          Video ini tidak dapat diputar di perangkat Anda.
        </p>
        <button
          type="button"
          onClick={() => void downloadMedia(item, { transcoded: true })}
          className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[15px] font-medium text-white backdrop-blur transition hover:bg-white/25"
        >
          <IconDownload className="h-4 w-4" />
          Unduh video
        </button>
      </Overlay>
    );
  }

  const src =
    source === "converted" ? `${item.previewUrl}?transcode=1` : item.previewUrl;

  return (
    <>
      {active && !ready ? (
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
        // Remounting on source change avoids the browser reusing the failed
        // decoder state from the original file.
        key={source}
        ref={videoRef}
        controls={active}
        playsInline
        preload={active || wasMediaOpened(item.id) ? "auto" : "metadata"}
        poster={item.thumbnailUrl}
        className={`h-full w-full bg-black object-contain transition-opacity duration-300 ${
          ready || !active ? "opacity-100" : "opacity-0"
        }`}
        src={src}
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
  const [src, setSrc] = useState<string | null>(() => cached ?? item.thumbnailUrl);
  const [ready, setReady] = useState(() => Boolean(cached) || !active);

  useEffect(() => {
    const blobUrl = getCachedPreviewUrl(item.id);
    if (blobUrl) {
      setSrc(blobUrl);
      setReady(true);
      markMediaOpened(item.id);
      return;
    }
    if (!active) {
      setSrc(item.thumbnailUrl);
      setReady(true);
      return;
    }
    setReady(false);
    let cancelled = false;
    void rememberPreview(item.id, item.previewUrl)
      .then((url) => {
        if (cancelled) return;
        setSrc(url);
        setReady(true);
        markMediaOpened(item.id);
      })
      .catch(() => {
        if (cancelled) return;
        setSrc(item.previewUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [active, item.id, item.previewUrl, item.thumbnailUrl]);

  if (!src) return null;

  return (
    <>
      {active && !ready ? (
        <Overlay thumbnailUrl={item.thumbnailUrl}>
          <Spinner size="lg" />
          <StatusCopy label="Memuat pratinjau" />
        </Overlay>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.name}
        draggable={false}
        className={`h-full w-full object-contain transition-opacity duration-300 ${
          ready || !active ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => {
          setReady(true);
          markMediaOpened(item.id);
        }}
        onError={() => setReady(true)}
      />
    </>
  );
}

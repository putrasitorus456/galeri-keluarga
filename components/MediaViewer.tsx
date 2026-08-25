"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, userMessage } from "@/lib/api-client";
import { downloadMedia, shareMedia } from "@/lib/share-download";
import type { MediaItem, MediaMetaResponse } from "@/lib/types";
import { AppHeader } from "@/components/AppHeader";
import { IconButton } from "@/components/Chrome";
import { IconDownload, IconShare } from "@/components/Icons";
import { LoadingPanel, Spinner, StatusCopy, useBusy } from "@/components/Loading";
import { ErrorState } from "@/components/States";

export function MediaViewer({
  albumId,
  mediaId,
}: {
  albumId: string;
  mediaId: string;
}) {
  const router = useRouter();
  const { show, hide } = useBusy();
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setMedia(null);
    setPreviewReady(false);
    show("Membuka kenangan");
    void apiFetch<MediaMetaResponse>(`/api/media/${mediaId}`)
      .then((data) => {
        if (cancelled) return;
        if (data.albumId !== albumId) {
          router.replace(`/album/${data.albumId}/${mediaId}`);
          return;
        }
        setMedia(data.media);
        hide();
      })
      .catch((err) => {
        if (cancelled) return;
        hide();
        setError(userMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [albumId, hide, mediaId, router, show]);

  async function onDownload() {
    if (!media) return;
    setBusy("download");
    setNotice(null);
    show("Mengunduh");
    try {
      await downloadMedia(media);
    } catch {
      setNotice("Foto/video ini tidak dapat dibuka.");
    } finally {
      hide();
      setBusy(null);
    }
  }

  async function onShare() {
    if (!media) return;
    setBusy("share");
    setNotice(null);
    show("Membagikan");
    const result = await shareMedia(media);
    if (result === "copied") setNotice("Tautan disalin.");
    if (result === "failed") setNotice("Tautan tidak dapat dibagikan.");
    hide();
    setBusy(null);
  }

  const heading =
    media?.type === "video" ? "Video" : media ? "Foto" : "Kenangan";

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col bg-black">
      <AppHeader
        title={heading}
        backHref={`/album/${albumId}`}
        actions={
          media ? (
            <>
              <IconButton
                label={busy === "download" ? "Mengunduh..." : "Download"}
                onClick={() => void onDownload()}
                disabled={busy !== null}
              >
                {busy === "download" ? (
                  <Spinner size="sm" />
                ) : (
                  <IconDownload className="h-5 w-5" />
                )}
              </IconButton>
              <IconButton
                label={busy === "share" ? "Membagikan..." : "Bagikan"}
                onClick={() => void onShare()}
                disabled={busy !== null}
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

      <main className="flex flex-1 flex-col px-2 pb-8 pt-2">
        {error ? (
          <ErrorState message={error} />
        ) : !media ? (
          <LoadingPanel label="Membuka kenangan" />
        ) : (
          <>
            <div className="relative flex flex-1 items-center justify-center">
              {previewReady ? null : (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
                  <Spinner size="lg" />
                  <StatusCopy label="Memuat pratinjau" />
                </div>
              )}
              {media.type === "video" ? (
                <video
                  controls
                  playsInline
                  preload="metadata"
                  className={`max-h-[78dvh] w-full bg-black transition-opacity duration-300 ${
                    previewReady ? "opacity-100" : "opacity-0"
                  }`}
                  src={media.previewUrl}
                  onLoadedData={() => setPreviewReady(true)}
                  onError={() => setPreviewReady(true)}
                >
                  Browser Anda tidak dapat memutar video ini.
                </video>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={media.previewUrl}
                  alt={media.name}
                  className={`max-h-[78dvh] w-full object-contain transition-opacity duration-300 ${
                    previewReady ? "opacity-100" : "opacity-0"
                  }`}
                  onLoad={() => setPreviewReady(true)}
                  onError={() => setPreviewReady(true)}
                />
              )}
            </div>

            {notice ? (
              <p className="mt-4 text-center text-[15px] text-muted" role="status">
                {notice}
              </p>
            ) : null}
          </>
        )}
      </main>
    </div>
  );
}

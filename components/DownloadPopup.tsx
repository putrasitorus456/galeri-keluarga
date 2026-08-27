"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadMedia, sleep } from "@/lib/share-download";
import type { MediaItem } from "@/lib/types";
import { IconCheck } from "@/components/Icons";
import { Spinner } from "@/components/Loading";

type MediaKinds = "image" | "video" | "mixed";

type DownloadState =
  | {
      phase: "loading";
      current: number;
      total: number;
      kinds: MediaKinds;
    }
  | {
      phase: "success";
      total: number;
      kinds: MediaKinds;
    }
  | {
      phase: "error";
      message: string;
    };

export type DownloadOutcome = "success" | "aborted" | "failed";

function kindsOf(items: MediaItem[]): MediaKinds {
  const hasImage = items.some((item) => item.type === "image");
  const hasVideo = items.some((item) => item.type === "video");
  if (hasImage && hasVideo) return "mixed";
  if (hasVideo) return "video";
  return "image";
}

function loadingTitle(state: Extract<DownloadState, { phase: "loading" }>) {
  if (state.total === 1) {
    return state.kinds === "video" ? "Mengunduh video" : "Mengunduh foto";
  }
  return `Mengunduh ${Math.min(state.current + 1, state.total)} dari ${state.total}`;
}

function successTitle(state: Extract<DownloadState, { phase: "success" }>) {
  if (state.total === 1) {
    return state.kinds === "video" ? "Video tersimpan" : "Foto tersimpan";
  }
  if (state.kinds === "video") return `${state.total} video tersimpan`;
  if (state.kinds === "image") return `${state.total} foto tersimpan`;
  return `${state.total} file tersimpan`;
}

export function useDownloadFlow() {
  const [state, setState] = useState<DownloadState | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimer = useRef(0);
  const mountedRef = useRef(true);

  const dismiss = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    abortRef.current = null;
    if (mountedRef.current) setState(null);
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dismiss();
  }, [dismiss]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  const download = useCallback(
    async (
      items: MediaItem[],
      options: { transcoded?: boolean } = {},
    ): Promise<DownloadOutcome> => {
      if (items.length === 0) return "aborted";
      if (abortRef.current) return "aborted";

      abortRef.current?.abort();
      window.clearTimeout(hideTimer.current);

      const controller = new AbortController();
      abortRef.current = controller;
      const kinds = kindsOf(items);
      let completed = 0;

      setState({
        phase: "loading",
        current: 0,
        total: items.length,
        kinds,
      });

      const stillActive = () => abortRef.current === controller;

      try {
        for (const item of items) {
          if (!stillActive()) return "aborted";
          const result = await downloadMedia(item, {
            transcoded: options.transcoded,
            signal: controller.signal,
          });
          if (!stillActive() || result === "aborted") {
            dismiss();
            return "aborted";
          }
          if (result === "failed") {
            abortRef.current = null;
            if (mountedRef.current) {
              setState({
                phase: "error",
                message: "Foto/video ini tidak dapat diunduh.",
              });
            }
            return "failed";
          }
          completed += 1;
          if (stillActive()) {
            setState({
              phase: "loading",
              current: completed,
              total: items.length,
              kinds,
            });
          }
          if (completed < items.length) {
            await sleep(450, controller.signal);
          }
        }

        if (!stillActive()) return "aborted";
        abortRef.current = null;
        if (mountedRef.current) {
          setState({ phase: "success", total: items.length, kinds });
        }
        hideTimer.current = window.setTimeout(dismiss, 2000);
        return "success";
      } catch (err) {
        if (!stillActive()) return "aborted";
        if (
          (err instanceof DOMException && err.name === "AbortError") ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          dismiss();
          return "aborted";
        }
        abortRef.current = null;
        if (mountedRef.current) {
          setState({
            phase: "error",
            message: "Foto/video ini tidak dapat diunduh.",
          });
        }
        return "failed";
      }
    },
    [dismiss],
  );

  return {
    download,
    downloading: state?.phase === "loading",
    popup: (
      <DownloadPopup state={state} onCancel={cancel} onDismiss={dismiss} />
    ),
  };
}

function DownloadPopup({
  state,
  onCancel,
  onDismiss,
}: {
  state: DownloadState | null;
  onCancel: () => void;
  onDismiss: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (state?.phase === "loading") cancelRef.current?.focus();
  }, [state?.phase]);

  useEffect(() => {
    if (!state) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (state.phase === "loading") onCancel();
      else onDismiss();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, onDismiss, state]);

  useEffect(() => {
    if (!state) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [state]);

  if (!state) return null;

  const titleId = "download-popup-title";
  const progress =
    state.phase === "loading" && state.total > 1
      ? Math.round((state.current / state.total) * 100)
      : null;

  return (
    <div
      className="popup-backdrop fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-live="assertive"
      onClick={state.phase === "loading" ? undefined : onDismiss}
    >
      <div
        key={state.phase}
        className="popup-card w-full max-w-[19.5rem] rounded-[1.6rem] bg-[#2c2c2e] px-5 pb-5 pt-7 text-center shadow-[0_18px_50px_rgba(0,0,0,0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        {state.phase === "loading" ? (
          <>
            <span className="relative mx-auto flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-white/8" />
              <Spinner size="lg" />
            </span>
            <h2
              id={titleId}
              className="mt-5 text-[17px] font-semibold tracking-tight text-white"
            >
              {loadingTitle(state)}
            </h2>
            <p className="mt-1 text-[14px] text-muted">Mohon tunggu sebentar</p>
            {progress !== null ? (
              <div
                className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/12"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.max(progress, 8)}%` }}
                />
              </div>
            ) : (
              <div className="progress-indeterminate mt-4 rounded-full" />
            )}
            <button
              ref={cancelRef}
              type="button"
              onClick={onCancel}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white/12 text-[16px] font-semibold text-white hover:bg-white/18 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Batalkan
            </button>
          </>
        ) : null}

        {state.phase === "success" ? (
          <>
            <span className="popup-check mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-black">
              <IconCheck className="h-8 w-8" />
            </span>
            <h2
              id={titleId}
              className="mt-5 text-[17px] font-semibold tracking-tight text-white"
            >
              {successTitle(state)}
            </h2>
            <p className="mt-1 text-[14px] text-muted">Selesai diunduh</p>
          </>
        ) : null}

        {state.phase === "error" ? (
          <>
            <h2
              id={titleId}
              className="text-[17px] font-semibold tracking-tight text-white"
            >
              Gagal mengunduh
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              {state.message}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-white text-[16px] font-semibold text-black hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Tutup
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

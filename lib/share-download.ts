import type { MediaItem } from "@/lib/types";

export type DownloadStatus = "saved" | "shared" | "aborted" | "failed";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function mp4Name(filename: string) {
  return filename.replace(/\.[^.]+$/, "") + ".mp4";
}

function isAbortError(err: unknown) {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && err.name === "AbortError")
  );
}

function saveBlob(blob: Blob, name: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
}

/**
 * `transcoded` asks the server for the H.264 copy instead of the original,
 * which is what a viewer wants when their device could not decode the source.
 */
export async function downloadMedia(
  item: MediaItem,
  options: { transcoded?: boolean; signal?: AbortSignal } = {},
): Promise<DownloadStatus> {
  const url = options.transcoded
    ? `${item.downloadUrl}?transcode=1`
    : item.downloadUrl;
  const name = options.transcoded ? mp4Name(item.name) : item.name;
  const mimeType = options.transcoded ? "video/mp4" : item.mimeType;

  if (options.signal?.aborted) return "aborted";

  try {
    const res = await fetch(url, {
      credentials: "include",
      signal: options.signal,
    });
    if (!res.ok) return "failed";
    const blob = await res.blob();
    if (options.signal?.aborted) return "aborted";

    const file = new File([blob], name, { type: mimeType || blob.type });

    if (isIOS() && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: item.name });
          return "shared";
        }
      } catch (err) {
        if (isAbortError(err)) return "aborted";
      }
    }

    saveBlob(blob, name);
    return "saved";
  } catch (err) {
    if (isAbortError(err)) return "aborted";
    return "failed";
  }
}

export async function shareMedia(item: MediaItem) {
  const url = `${window.location.origin}/m/${item.id}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: item.name, url });
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "aborted";
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}

export function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

import type { MediaItem } from "@/lib/types";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function mp4Name(filename: string) {
  return filename.replace(/\.[^.]+$/, "") + ".mp4";
}

/**
 * `transcoded` asks the server for the H.264 copy instead of the original,
 * which is what a viewer wants when their device could not decode the source.
 */
export async function downloadMedia(
  item: MediaItem,
  options: { transcoded?: boolean } = {},
) {
  const url = options.transcoded
    ? `${item.downloadUrl}?transcode=1`
    : item.downloadUrl;
  const name = options.transcoded ? mp4Name(item.name) : item.name;
  const mimeType = options.transcoded ? "video/mp4" : item.mimeType;

  if (isIOS() && navigator.canShare) {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], name, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: item.name });
          return;
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
    }
  }

  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
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

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

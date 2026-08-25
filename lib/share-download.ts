import type { MediaItem } from "@/lib/types";

function isIOS() {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export async function downloadMedia(item: MediaItem) {
  if (isIOS() && navigator.canShare) {
    try {
      const res = await fetch(item.downloadUrl, { credentials: "include" });
      if (res.ok) {
        const blob = await res.blob();
        const file = new File([blob], item.name, { type: item.mimeType });
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
  link.href = item.downloadUrl;
  link.download = item.name;
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

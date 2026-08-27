function isAppleWebkit() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const appleDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const desktopSafari =
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|Edg|OPR|Firefox|Android/i.test(ua);
  return appleDevice || desktopSafari;
}

export function transcodedFileUrl(previewUrl: string, extra: Record<string, string> = {}) {
  const url = new URL(previewUrl, "http://local.invalid");
  url.searchParams.set("transcode", "1");
  for (const [key, value] of Object.entries(extra)) {
    url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export async function prepareTranscodedPreview(previewUrl: string) {
  const url = transcodedFileUrl(previewUrl, { prepare: "1" });
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) return;
      lastError = new Error(`prepare ${res.status}`);
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("prepare");
    }
    await new Promise((resolve) => setTimeout(resolve, 1200 * (attempt + 1)));
  }

  throw lastError ?? new Error("prepare");
}

export function browserNeedsVideoTranscode(mimeType: string) {
  if (mimeType === "video/webm") return false;
  if (isAppleWebkit()) return false;
  return mimeType === "video/quicktime" || mimeType === "video/x-matroska";
}

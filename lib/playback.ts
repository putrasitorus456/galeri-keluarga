export function browserNeedsVideoTranscode(mimeType: string) {
  if (mimeType === "video/mp4" || mimeType === "video/webm") return false;
  if (typeof navigator === "undefined") return false;

  const ua = navigator.userAgent;
  const appleDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const desktopSafari =
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|Edg|OPR|Firefox|Android/i.test(ua);
  if (appleDevice || desktopSafari) return false;

  return mimeType === "video/quicktime" || mimeType === "video/x-matroska";
}

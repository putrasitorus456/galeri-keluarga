export const THUMB = {
  strip: 200,
  /** Cukup tajam untuk sel grid; jauh lebih ringan dari 400. */
  grid: 240,
  cover: 360,
  poster: 800,
  /** Pratinjau tajam untuk viewer sambil file asli masih diunduh. */
  view: 2048,
} as const;

export function thumbUrl(id: string, size: number = THUMB.grid) {
  return `/api/media/${id}/thumbnail?s=${size}`;
}

/** Stream file media (foto asli / video) lewat proxy Drive. */
export function fileUrl(id: string) {
  return `/api/media/${id}/file`;
}

export function sizedThumb(url: string | undefined, size: number) {
  if (!url) return url;
  if (/[?&]s=\d+/.test(url)) return url.replace(/([?&]s=)\d+/, `$1${size}`);
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}s=${size}`;
}

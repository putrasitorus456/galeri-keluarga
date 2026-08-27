export const THUMB = {
  strip: 200,
  grid: 400,
  cover: 400,
  poster: 800,
  view: 1600,
} as const;

export function thumbUrl(id: string, size: number = THUMB.grid) {
  return `/api/media/${id}/thumbnail?s=${size}`;
}

export function sizedThumb(url: string | undefined, size: number) {
  if (!url) return url;
  if (/[?&]s=\d+/.test(url)) return url.replace(/([?&]s=)\d+/, `$1${size}`);
  const joiner = url.includes("?") ? "&" : "?";
  return `${url}${joiner}s=${size}`;
}

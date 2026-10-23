/**
 * Batasi jumlah request thumbnail bersamaan ke origin yang sama.
 * Tanpa ini, puluhan <img> menembak Next→Drive sekaligus dan saling mengantri.
 * Slot dilepas di onLoadStart (bukan onLoad), jadi decode tidak menahan antrean.
 */
const MAX_ACTIVE = 20;
let active = 0;
const waiters: Array<() => void> = [];

/** URL preview yang sudah pernah sukses ditampilkan di sesi ini. */
const seenThumbs = new Set<string>();

export function thumbWasSeen(...urls: Array<string | undefined | null>) {
  return urls.some((url) => Boolean(url && seenThumbs.has(url)));
}

export function markThumbSeen(...urls: Array<string | undefined | null>) {
  for (const url of urls) {
    if (url) seenThumbs.add(url);
  }
}

export function clearSeenThumbs() {
  seenThumbs.clear();
}

export function acquireThumbSlot(): Promise<void> {
  if (active < MAX_ACTIVE) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

export function releaseThumbSlot() {
  active = Math.max(0, active - 1);
  const next = waiters.shift();
  if (next) next();
}

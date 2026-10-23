import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import convert from "heic-convert";

/** Satu konversi penuh sekaligus — heic-convert CPU-bound dan bisa mengunci event loop. */
const HEIC_MAX_CONCURRENT = 1;
let heicRunning = 0;
const heicWaiters: Array<() => void> = [];

async function withHeicSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (heicRunning >= HEIC_MAX_CONCURRENT) {
    await new Promise<void>((resolve) => {
      heicWaiters.push(resolve);
    });
  }
  heicRunning += 1;
  try {
    return await fn();
  } finally {
    heicRunning = Math.max(0, heicRunning - 1);
    heicWaiters.shift()?.();
  }
}

export function jpegPreviewName(filename: string) {
  return /\.hei[cf]$/i.test(filename)
    ? filename.replace(/\.hei[cf]$/i, ".jpg")
    : `${filename}.jpg`;
}

export function enlargeThumbnailLink(link: string, size = 800) {
  let next = link.replace(/=s\d+/, `=s${size}`);
  next = next.replace(/([?&]sz=)s\d+/i, `$1s${size}`);
  next = next.replace(/([?&]sz=)w\d+/i, `$1w${size}`);
  if (next === link && !/=s\d+/.test(link) && !/[?&]sz=/i.test(link)) {
    const joiner = link.includes("?") ? "&" : "?";
    next = `${link}${joiner}sz=s${size}`;
  }
  return next;
}

export function driveThumbnailUrl(fileId: string, size = 800) {
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w${size}`;
}

export async function convertHeicStreamToJpeg(
  stream: Readable,
  timeoutMs = 90_000,
) {
  return withHeicSlot(async () => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      stream.destroy(new Error("HEIC convert timed out"));
    }, timeoutMs);

    try {
      const input = await buffer(stream);
      if (timedOut) throw new Error("HEIC convert timed out");
      const output = await convert({
        buffer: input,
        format: "JPEG",
        quality: 0.88,
      });
      if (timedOut) throw new Error("HEIC convert timed out");
      return Buffer.from(output);
    } finally {
      clearTimeout(timer);
    }
  });
}

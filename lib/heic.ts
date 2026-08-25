import type { Readable } from "node:stream";
import { buffer } from "node:stream/consumers";
import convert from "heic-convert";

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

export async function convertHeicStreamToJpeg(stream: Readable) {
  const input = await buffer(stream);
  const output = await convert({
    buffer: input,
    format: "JPEG",
    quality: 0.88,
  });
  return Buffer.from(output);
}

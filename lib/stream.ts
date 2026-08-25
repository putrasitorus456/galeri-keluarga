import { Readable } from "node:stream";

export function nodeStreamToWeb(stream: Readable) {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

export function contentDisposition(filename: string, inline = false) {
  const fallback = filename.replace(/[^\x20-\x7E]+/g, "_") || "file";
  const encoded = encodeURIComponent(filename);
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

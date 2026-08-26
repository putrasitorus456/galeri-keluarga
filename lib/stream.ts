import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

export function nodeStreamToWeb(stream: Readable) {
  return Readable.toWeb(stream) as ReadableStream<Uint8Array>;
}

type ParsedRange = { start: number; end: number } | "unsatisfiable" | null;

export function parseRange(header: string | null, size: number): ParsedRange {
  const match = header && /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  if (!startRaw && !endRaw) return null;

  const start = startRaw ? Number(startRaw) : Math.max(0, size - Number(endRaw));
  const end =
    startRaw && endRaw ? Math.min(Number(endRaw), size - 1) : size - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return "unsatisfiable";
  return { start, end };
}

export function localFileResponse(
  filePath: string,
  size: number,
  rangeHeader: string | null,
  extraHeaders: Record<string, string>,
) {
  const range = parseRange(rangeHeader, size);
  const headers = new Headers(extraHeaders);
  headers.set("Accept-Ranges", "bytes");

  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : size - 1;
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${size}`);

  return new Response(nodeStreamToWeb(createReadStream(filePath, { start, end })), {
    status: range ? 206 : 200,
    headers,
  });
}

export function contentDisposition(filename: string, inline = false) {
  const fallback = filename.replace(/[^\x20-\x7E]+/g, "_") || "file";
  const encoded = encodeURIComponent(filename);
  const type = inline ? "inline" : "attachment";
  return `${type}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

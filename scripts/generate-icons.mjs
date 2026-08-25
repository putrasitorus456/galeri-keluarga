import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y, width, height);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function inCircle(x, y, cx, cy, r) {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function draw(x, y, size) {
  const teal = [15, 118, 110, 255];
  const white = [255, 255, 255, 255];
  const pad = Math.floor(size * 0.08);
  if (x < pad || y < pad || x >= size - pad || y >= size - pad) {
    return [247, 245, 241, 255];
  }

  const frameX0 = Math.floor(size * 0.22);
  const frameY0 = Math.floor(size * 0.28);
  const frameX1 = Math.floor(size * 0.78);
  const frameY1 = Math.floor(size * 0.76);
  const inFrame = x >= frameX0 && x <= frameX1 && y >= frameY0 && y <= frameY1;

  if (inFrame) {
    const sunX = Math.floor(size * 0.36);
    const sunY = Math.floor(size * 0.42);
    const sunR = Math.floor(size * 0.055);
    if (inCircle(x, y, sunX, sunY, sunR)) return white;

    const peak = (x - frameX0) / (frameX1 - frameX0);
    const mountain1 = frameY1 - Math.floor(size * 0.22) + Math.abs(peak - 0.35) * size * 0.55;
    const mountain2 = frameY1 - Math.floor(size * 0.16) + Math.abs(peak - 0.7) * size * 0.5;
    if (y > mountain1 || y > mountain2) return white;
    return teal;
  }

  const lensX = Math.floor(size * 0.62);
  const lensY = Math.floor(size * 0.24);
  const lensR = Math.floor(size * 0.07);
  if (inCircle(x, y, lensX, lensY, lensR)) return white;

  return teal;
}

for (const size of [192, 512]) {
  const buffer = png(size, size, (x, y, w) => draw(x, y, w));
  writeFileSync(join(iconsDir, `icon-${size}.png`), buffer);
}

copyFileSync(join(iconsDir, "icon-192.png"), join(root, "app", "icon.png"));
console.log("Ikon dibuat di public/icons dan app/icon.png");

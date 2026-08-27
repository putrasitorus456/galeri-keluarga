import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "public", "icons");
mkdirSync(iconsDir, { recursive: true });

const sources = [
  ["icon-192-new.png", "icon-192.png"],
  ["icon-512-new.png", "icon-512.png"],
];

for (const [from, to] of sources) {
  const src = join(iconsDir, from);
  if (!existsSync(src)) {
    throw new Error(`Ikon sumber tidak ada: public/icons/${from}`);
  }
  copyFileSync(src, join(iconsDir, to));
}

const icon192 = join(iconsDir, "icon-192.png");
copyFileSync(icon192, join(root, "app", "apple-icon.png"));

function gallerySvg() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="#0c0c0e"/>
  <rect x="5.5" y="7.5" width="21" height="17" rx="2.2" fill="#161618" stroke="#f2f2f4" stroke-width="2"/>
  <circle cx="11.8" cy="13.2" r="1.85" fill="#f2f2f4"/>
  <path d="M7 22.6 12.5 16.1 16.3 19.6 19.9 14.7 25 22.6Z" fill="#f2f2f4"/>
</svg>`;
}

async function renderGallery(size) {
  return sharp(Buffer.from(gallerySvg()))
    .resize(size, size, { fit: "fill" })
    .png()
    .toBuffer();
}

function pngToIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const entries = [];
  const payloads = [];
  let offset = 6 + 16 * count;

  for (const image of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(image.width >= 256 ? 0 : image.width, 0);
    entry.writeUInt8(image.height >= 256 ? 0 : image.height, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(image.buffer.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += image.buffer.length;
    entries.push(entry);
    payloads.push(image.buffer);
  }

  return Buffer.concat([header, ...entries, ...payloads]);
}

const favicon32 = await renderGallery(32);
const favicon48 = await renderGallery(48);
writeFileSync(join(iconsDir, "favicon-32.png"), favicon32);
writeFileSync(join(root, "app", "icon.png"), favicon32);

const favicon = pngToIco([
  { width: 16, height: 16, buffer: await renderGallery(16) },
  { width: 32, height: 32, buffer: favicon32 },
  { width: 48, height: 48, buffer: favicon48 },
]);
writeFileSync(join(root, "app", "favicon.ico"), favicon);
writeFileSync(join(root, "public", "favicon.ico"), favicon);

console.log("Foto dipakai untuk PWA; favicon website memakai ikon galeri gelap");

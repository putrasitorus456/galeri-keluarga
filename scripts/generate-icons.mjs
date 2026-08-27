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
copyFileSync(icon192, join(root, "app", "icon.png"));
copyFileSync(icon192, join(root, "app", "apple-icon.png"));

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

const icoImages = [];
for (const size of [16, 32, 48]) {
  const buffer = await sharp(icon192)
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
  icoImages.push({ width: size, height: size, buffer });
}

const favicon = pngToIco(icoImages);
writeFileSync(join(root, "app", "favicon.ico"), favicon);
writeFileSync(join(root, "public", "favicon.ico"), favicon);

console.log("Ikon dipasang ke public/icons, app/icon.png, app/apple-icon.png, dan favicon.ico");

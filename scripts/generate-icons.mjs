import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
console.log("Ikon dipasang ke public/icons, app/icon.png, dan app/apple-icon.png");

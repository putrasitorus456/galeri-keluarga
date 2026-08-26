import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error("Folder .next/standalone tidak ditemukan.");
  process.exit(1);
}

cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
mkdirSync(join(standalone, ".next"), { recursive: true });
cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), {
  recursive: true,
});

// Next's file tracing misses these because they are binaries, not imports.
for (const pkg of ["ffmpeg-static", "ffprobe-static"]) {
  const from = join(root, "node_modules", pkg);
  if (!existsSync(from)) {
    console.error(`Paket ${pkg} tidak ditemukan; video HEVC tidak akan bisa dikonversi.`);
    process.exit(1);
  }
  cpSync(from, join(standalone, "node_modules", pkg), { recursive: true });
}

console.log("Standalone siap (public + static + binari ffmpeg disalin).");

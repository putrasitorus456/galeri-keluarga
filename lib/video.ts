import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { getFileStream } from "@/lib/drive";
import { AppError, MESSAGES } from "@/lib/errors";

// Bump when the ffmpeg arguments change so stale cached files are ignored.
const CACHE_VERSION = "v3";
const MAX_SOURCE_BYTES = envMb("VIDEO_TRANSCODE_MAX_MB", 512);
const CACHE_BUDGET_BYTES = envMb("VIDEO_CACHE_MAX_MB", 2048);
const TRANSCODE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_CONCURRENT_TRANSCODES = 1;

function envMb(name: string, fallbackMb: number) {
  const parsed = Number(process.env[name]);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
  return mb * 1024 * 1024;
}

export function mp4PreviewName(filename: string) {
  return filename.replace(/\.[^.]+$/, "") + ".mp4";
}

function cacheDir() {
  return (
    process.env.VIDEO_CACHE_DIR?.trim() ||
    path.join(tmpdir(), "galeri-keluarga-video")
  );
}

function binary(name: "ffmpeg" | "ffprobe") {
  const resolved = name === "ffmpeg" ? ffmpegStatic : ffprobeStatic.path;
  if (!resolved) {
    throw new AppError("config", MESSAGES.videoUnsupported, 502);
  }
  return resolved;
}

function run(command: string, args: string[], timeoutMs: number) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    // ffmpeg is chatty on stderr; keep only the tail for error reporting.
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${path.basename(command)} exit ${code}: ${stderr}`));
    });
  });
}

type ProbedStream = {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  color_transfer?: string;
};

async function probe(file: string) {
  const raw = await run(
    binary("ffprobe"),
    ["-v", "error", "-print_format", "json", "-show_streams", file],
    60_000,
  );
  const streams = (JSON.parse(raw).streams ?? []) as ProbedStream[];
  return {
    video: streams.find((s) => s.codec_type === "video"),
    audio: streams.find((s) => s.codec_type === "audio"),
  };
}

let filterSupport: Promise<Set<string>> | null = null;

async function supportsHdrToneMapping() {
  filterSupport ??= run(binary("ffmpeg"), ["-hide_banner", "-filters"], 30_000)
    .then((out) => new Set(out.match(/^\s*\S+\s+(\S+)/gm)?.map((l) => l.trim().split(/\s+/)[1]) ?? []))
    .catch(() => new Set<string>());
  const filters = await filterSupport;
  return filters.has("zscale") && filters.has("tonemap");
}

function isHdr(video?: ProbedStream) {
  return (
    video?.color_transfer === "smpte2084" ||
    video?.color_transfer === "arib-std-b67"
  );
}

// HDR sources (iPhone HLG/Dolby Vision) look washed out if merely converted to
// 8-bit, so map them into SDR BT.709 when the filters are available.
const TONEMAP_CHAIN =
  "zscale=transfer=linear:npl=100,format=gbrpf32le,zscale=primaries=bt709," +
  "tonemap=tonemap=hable:desat=0,zscale=transfer=bt709:matrix=bt709:range=tv,format=yuv420p";

async function buildArgs(source: string, target: string) {
  const { video, audio } = await probe(source);
  if (!video) {
    throw new AppError("bad_request", MESSAGES.videoUnsupported, 415);
  }

  const copyVideo = video.codec_name === "h264" && video.pix_fmt === "yuv420p";
  const copyAudio = audio?.codec_name === "aac";
  const tonemap = !copyVideo && isHdr(video) && (await supportsHdrToneMapping());

  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", source, "-map", "0:v:0"];
  args.push(...(audio ? ["-map", "0:a:0"] : ["-an"]));

  if (copyVideo) {
    args.push("-c:v", "copy");
  } else {
    // 720p / 30fps / ultrafast keeps first-open conversion usable on phones
    // while still fitting typical Android H.264 decoders.
    const scale = "scale='min(720,iw)':-2,fps=30";
    args.push("-vf", tonemap ? `${TONEMAP_CHAIN},${scale}` : scale);
    args.push(
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "24",
      "-profile:v", "main",
      "-level", "4.0",
      "-pix_fmt", "yuv420p",
    );
  }
  args.push("-tag:v", "avc1");

  if (audio) {
    args.push(...(copyAudio ? ["-c:a", "copy"] : ["-c:a", "aac", "-b:a", "160k", "-ac", "2"]));
  }

  args.push("-movflags", "+faststart", "-f", "mp4", target);
  return { args, tonemap };
}

let running = 0;
const queue: (() => void)[] = [];

async function acquireSlot() {
  if (running < MAX_CONCURRENT_TRANSCODES) {
    running += 1;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
}

function releaseSlot() {
  const next = queue.shift();
  if (next) next();
  else running -= 1;
}

async function downloadSource(fileId: string, target: string) {
  const { stream } = await getFileStream(fileId, null, { alreadyVerified: true });
  await pipeline(stream, createWriteStream(target));
}

async function pruneCache(dir: string) {
  const names = (await readdir(dir).catch(() => [])).filter((n) => n.endsWith(".mp4"));
  const entries = [];
  let total = 0;
  for (const name of names) {
    const full = path.join(dir, name);
    const info = await stat(full).catch(() => null);
    if (!info) continue;
    entries.push({ full, size: info.size, used: info.atimeMs });
    total += info.size;
  }
  if (total <= CACHE_BUDGET_BYTES) return;

  entries.sort((a, b) => a.used - b.used);
  for (const entry of entries) {
    if (total <= CACHE_BUDGET_BYTES) break;
    await rm(entry.full, { force: true }).catch(() => undefined);
    total -= entry.size;
  }
}

async function transcode(fileId: string, sizeBytes: number) {
  if (sizeBytes > MAX_SOURCE_BYTES) {
    throw new AppError("bad_request", MESSAGES.videoTooLarge, 413);
  }

  const dir = cacheDir();
  await mkdir(dir, { recursive: true });
  const output = path.join(dir, `${CACHE_VERSION}-${fileId}.mp4`);
  const source = path.join(dir, `${CACHE_VERSION}-${fileId}.src`);
  const partial = `${output}.part`;

  await acquireSlot();
  try {
    await downloadSource(fileId, source);
    const { args, tonemap } = await buildArgs(source, partial);
    try {
      await run(binary("ffmpeg"), args, TRANSCODE_TIMEOUT_MS);
    } catch (err) {
      // The tone mapping chain depends on optional ffmpeg filters; a plain
      // 8-bit conversion is still better than no playback at all.
      if (!tonemap) throw err;
      console.warn(`Tone mapping gagal untuk ${fileId}, mencoba tanpa tonemap`, err);
      await run(
        binary("ffmpeg"),
        args.filter((arg, i) => arg !== "-vf" && args[i - 1] !== "-vf"),
        TRANSCODE_TIMEOUT_MS,
      );
    }
    await rename(partial, output);
    return output;
  } catch (err) {
    await rm(partial, { force: true }).catch(() => undefined);
    if (err instanceof AppError) throw err;
    console.error(`Transcode video gagal untuk ${fileId}`, err);
    throw new AppError("drive", MESSAGES.videoUnsupported, 502);
  } finally {
    releaseSlot();
    await rm(source, { force: true }).catch(() => undefined);
    void pruneCache(dir).catch(() => undefined);
  }
}

const inFlight = new Map<string, Promise<string>>();

/**
 * Returns a local H.264/AAC MP4 for a Drive video, converting it on first use.
 * Needed because browsers other than Safari cannot decode the HEVC that iPhones
 * record into .MOV files.
 */
export async function getPlayableVideo(fileId: string, sizeBytes: number) {
  const cached = path.join(cacheDir(), `${CACHE_VERSION}-${fileId}.mp4`);
  const info = await stat(cached).catch(() => null);
  if (info?.isFile()) {
    const now = new Date();
    await utimes(cached, now, info.mtime).catch(() => undefined);
    return { path: cached, size: info.size };
  }

  let pending = inFlight.get(fileId);
  if (!pending) {
    pending = transcode(fileId, sizeBytes).finally(() => inFlight.delete(fileId));
    inFlight.set(fileId, pending);
  }

  const file = await pending;
  const { size } = await stat(file);
  return { path: file, size };
}

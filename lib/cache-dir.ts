import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Prefer project-local `.data/` so cache survives process restarts.
 * Override with env (e.g. a Railway volume mount) when available.
 */
export function resolveCacheDir(envName: string, folder: string) {
  const fromEnv = process.env[envName]?.trim();
  if (fromEnv) return fromEnv;
  try {
    return path.join(process.cwd(), ".data", folder);
  } catch {
    return path.join(tmpdir(), `galeri-keluarga-${folder}`);
  }
}

export async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
  return dir;
}

export function envMb(name: string, fallbackMb: number) {
  const parsed = Number(process.env[name]);
  const mb = Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMb;
  return mb * 1024 * 1024;
}

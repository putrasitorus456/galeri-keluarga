import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { revalidateTag, unstable_cache } from "next/cache";
import { AppError, MESSAGES } from "@/lib/errors";
import { getCollectionDef, sortAlbumsByRecent } from "@/lib/collections";
import { THUMB, thumbUrl } from "@/lib/media-url";
import type {
  Album,
  AlbumCrumb,
  LibraryKind,
  MediaItem,
  MediaType,
} from "@/lib/types";

const FOLDER_MIME = "application/vnd.google-apps.folder";
const HEIC_IMAGE = [
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
] as const;
const ALLOWED_IMAGE = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  ...HEIC_IMAGE,
]);
const ALLOWED_VIDEO = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska",
]);

export const PAGE_SIZE = 50;
const COUNT_PAGE_SIZE = 1000;
const COUNT_MAX_PAGES = 1;
const LITE_PAGE_SIZE = 100;
const SUMMARY_CONCURRENCY = 8;
const LIBRARY_MAX_ITEMS = 2000;
const META_TTL_MS = 10 * 60 * 1000;

/**
 * Batas penelusuran subfolder. Tanpa ini satu album dengan struktur dalam bisa
 * memicu ribuan panggilan Drive dalam satu permintaan.
 */
const MAX_ALBUM_DEPTH = 8;
const TREE_FOLDER_BUDGET = 400;
const SUBTREE_FOLDER_BUDGET = 80;
const PARENT_QUERY_CHUNK = 40;
const DRIVE_LIST_CONCURRENCY = 12;

let driveClient: drive_v3.Drive | null = null;
const fileMetaCache = new Map<string, { at: number; data: drive_v3.Schema$File }>();
const thumbnailLinkCache = new Map<string, string>();
const knownAlbumIds = new Set<string>();
const albumTrailCache = new Map<string, { at: number; trail: AlbumCrumb[] }>();

type FolderRef = {
  id: string;
  name: string;
  parentId?: string;
  modifiedTime?: string;
};

type AlbumSummary = {
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  itemCount?: number;
  imageCount?: number;
  videoCount?: number;
  gifCount?: number;
  folderCount?: number;
  modifiedTime?: string;
};

function rememberAlbumId(id?: string | null) {
  if (id) knownAlbumIds.add(id);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

/**
 * Penelusuran subfolder bersifat rekursif, jadi jumlah panggilan paralel dibatasi
 * secara global agar tidak menabrak rate limit Drive.
 */
let activeListCalls = 0;
const listCallQueue: (() => void)[] = [];

async function withListSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeListCalls >= DRIVE_LIST_CONCURRENCY) {
    await new Promise<void>((resolve) => listCallQueue.push(resolve));
  }
  activeListCalls += 1;
  try {
    return await run();
  } finally {
    activeListCalls -= 1;
    listCallQueue.shift()?.();
  }
}

export function isHeicMime(mime: string) {
  return (HEIC_IMAGE as readonly string[]).includes(mime);
}

export function mediaTypeFromMime(mime: string): MediaType | null {
  if (ALLOWED_IMAGE.has(mime)) return "image";
  if (ALLOWED_VIDEO.has(mime)) return "video";
  return null;
}

function getRootFolderId() {
  const id = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  if (!id) {
    throw new AppError("config", MESSAGES.config, 502);
  }
  return id;
}

function loadServiceAccountCredentials() {
  const raw =
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (raw) {
    try {
      if (raw.startsWith("{")) {
        return JSON.parse(raw) as { client_email: string; private_key: string };
      }
      return JSON.parse(readFileSync(raw, "utf8")) as {
        client_email: string;
        private_key: string;
      };
    } catch (err) {
      console.error("Gagal membaca GOOGLE_SERVICE_ACCOUNT_JSON:", err);
      throw new AppError("config", MESSAGES.config, 502);
    }
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(
    /\\n/g,
    "\n",
  );
  if (email && key) {
    return { client_email: email, private_key: key };
  }

  console.error(
    "Kredensial Google Drive belum diisi. Set GOOGLE_SERVICE_ACCOUNT_JSON (path atau isi JSON) atau pasangan GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.",
  );
  throw new AppError("config", MESSAGES.config, 502);
}

function getAuth() {
  const credentials = loadServiceAccountCredentials();
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

function getDrive() {
  if (!driveClient) {
    driveClient = google.drive({ version: "v3", auth: getAuth() });
  }
  return driveClient;
}

function mapGoogleError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const code = Number((err as { code?: number }).code);
  if (code === 404 || code === 403) {
    return new AppError("not_found", MESSAGES.notFound, 404);
  }
  console.error(err);
  return new AppError("drive", MESSAGES.drive, 502);
}

async function getFileMetadata(fileId: string) {
  const cached = fileMetaCache.get(fileId);
  if (cached && Date.now() - cached.at < META_TTL_MS) {
    return cached.data;
  }
  try {
    const drive = getDrive();
    const { data } = await drive.files.get({
      fileId,
      fields:
        "id, name, mimeType, parents, trashed, thumbnailLink, modifiedTime, size",
      supportsAllDrives: true,
    });
    fileMetaCache.set(fileId, { at: Date.now(), data });
    if (data.thumbnailLink) thumbnailLinkCache.set(fileId, data.thumbnailLink);
    if (fileMetaCache.size > 800) {
      const oldest = fileMetaCache.keys().next().value;
      if (oldest) fileMetaCache.delete(oldest);
    }
    return data;
  } catch (err) {
    throw mapGoogleError(err);
  }
}

export function peekThumbnailLink(fileId: string) {
  return thumbnailLinkCache.get(fileId);
}

export async function getThumbnailSource(fileId: string) {
  const cachedLink = peekThumbnailLink(fileId);
  if (cachedLink) return { thumbnailLink: cachedLink };

  const file = await getFileMetadata(fileId);
  if (file.trashed || !file.mimeType || !mediaTypeFromMime(file.mimeType)) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }
  return { thumbnailLink: file.thumbnailLink ?? null };
}

/**
 * Menelusuri rantai induk sebuah folder sampai bertemu root. Hasilnya adalah
 * jejak dari album teratas hingga folder yang diminta; folder yang tidak
 * bermuara ke root dianggap tidak ada.
 */
export async function getAlbumTrail(albumId: string): Promise<AlbumCrumb[]> {
  const cached = albumTrailCache.get(albumId);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.trail;

  const rootId = getRootFolderId();
  if (albumId === rootId) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }

  const trail: AlbumCrumb[] = [];
  let currentId: string | undefined = albumId;

  for (let depth = 0; depth < MAX_ALBUM_DEPTH && currentId; depth += 1) {
    const file = await getFileMetadata(currentId);
    if (file.trashed || file.mimeType !== FOLDER_MIME || !file.id || !file.name) {
      throw new AppError("not_found", MESSAGES.notFound, 404);
    }
    trail.unshift({ id: file.id, name: file.name });

    const parents = file.parents ?? [];
    if (parents.includes(rootId)) {
      for (const crumb of trail) rememberAlbumId(crumb.id);
      albumTrailCache.set(albumId, { at: Date.now(), trail });
      return trail;
    }
    currentId = parents[0];
  }

  throw new AppError("not_found", MESSAGES.notFound, 404);
}

export async function assertAlbum(albumId: string) {
  await getAlbumTrail(albumId);
  return getFileMetadata(albumId);
}

export async function assertMediaAccessible(fileId: string) {
  const file = await getFileMetadata(fileId);
  if (file.trashed || !file.id || !file.name || !file.mimeType) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }
  const type = mediaTypeFromMime(file.mimeType);
  if (!type) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }
  const parentId = file.parents?.[0];
  if (!parentId) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }
  if (!knownAlbumIds.has(parentId)) {
    await assertAlbum(parentId);
  }
  rememberAlbumId(parentId);
  return { file, type, albumId: parentId };
}

function toAlbum(folder: FolderRef, extra: AlbumSummary = {}): Album {
  return {
    id: folder.id,
    name: folder.name,
    thumbnailUrl: extra.thumbnailUrl,
    thumbnailUrls: extra.thumbnailUrls,
    itemCount: extra.itemCount,
    imageCount: extra.imageCount,
    videoCount: extra.videoCount,
    gifCount: extra.gifCount,
    folderCount: extra.folderCount,
    modifiedTime: extra.modifiedTime ?? folder.modifiedTime,
  };
}

function mimeQueryFor(typeFilter?: string) {
  if (typeFilter === "image") return "mimeType contains 'image/'";
  if (typeFilter === "video") return "mimeType contains 'video/'";
  if (typeFilter === "gif") return "mimeType = 'image/gif'";
  return "(mimeType contains 'image/' or mimeType contains 'video/')";
}

type FolderScan = {
  coverUrls: string[];
  subFolderIds: string[];
  count: number;
  imageCount: number;
  videoCount: number;
  gifCount: number;
  newestTime?: string;
  exact: boolean;
};

/**
 * Isi langsung satu folder: media dan subfolder sekaligus, karena Drive tidak
 * bisa mengurutkan folder lebih dulu (orderBy "folder" mengurut berdasarkan ID
 * induk, bukan jenis). Mode lite membaca satu halaman untuk sampul, mode full
 * membaca hingga 1000 anak sehingga hitungannya pasti.
 */
async function scanFolder(
  albumId: string,
  mode: "lite" | "full",
): Promise<FolderScan> {
  const drive = getDrive();
  const coverUrls: string[] = [];
  const subFolderIds: string[] = [];
  let count = 0;
  let imageCount = 0;
  let videoCount = 0;
  let gifCount = 0;
  let newestTime: string | undefined;
  let pageToken: string | undefined;
  const pageSize = mode === "lite" ? LITE_PAGE_SIZE : COUNT_PAGE_SIZE;
  const maxPages = mode === "lite" ? 1 : COUNT_MAX_PAGES;

  for (let page = 0; page < maxPages; page += 1) {
    const { data }: { data: drive_v3.Schema$FileList } = await withListSlot(() =>
      drive.files.list({
        q: `'${albumId}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, mimeType, modifiedTime, thumbnailLink)",
        orderBy: "modifiedTime desc",
        pageSize,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      }),
    );

    for (const file of data.files ?? []) {
      if (!file.id || !file.mimeType) continue;
      if (file.mimeType === FOLDER_MIME) {
        subFolderIds.push(file.id);
        rememberAlbumId(file.id);
        continue;
      }
      const type = mediaTypeFromMime(file.mimeType);
      if (!type) continue;
      count += 1;
      if (type === "video") videoCount += 1;
      else {
        imageCount += 1;
        if (file.mimeType === "image/gif") gifCount += 1;
      }
      if (coverUrls.length < 4) {
        coverUrls.push(thumbUrl(file.id, THUMB.cover));
        if (file.thumbnailLink) thumbnailLinkCache.set(file.id, file.thumbnailLink);
      }
      newestTime ??= file.modifiedTime ?? undefined;
    }

    pageToken = data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return {
    coverUrls,
    subFolderIds,
    count,
    imageCount,
    videoCount,
    gifCount,
    newestTime,
    exact: mode === "full" || !pageToken,
  };
}

function emptySummary(): AlbumSummary {
  return {};
}

/**
 * Ringkasan cepat: hitungan hanya untuk isi langsung. Kalau folder cuma berisi
 * subfolder, sampulnya dipinjam dari folder anak supaya kartunya tidak kosong.
 */
async function summarizeAlbumLite(
  albumId: string,
  depth = 0,
): Promise<AlbumSummary> {
  try {
    const scan = await scanFolder(albumId, "lite");
    let coverUrls = scan.coverUrls;

    if (coverUrls.length === 0 && scan.subFolderIds.length > 0 && depth < 2) {
      const child = await summarizeAlbumLite(scan.subFolderIds[0], depth + 1);
      coverUrls = child.thumbnailUrls ?? [];
    }

    // Hitungan disembunyikan bila ada subfolder; angka pastinya menyusul dari mode full.
    const exact = scan.exact && scan.subFolderIds.length === 0;
    return {
      thumbnailUrl: coverUrls[0],
      thumbnailUrls: coverUrls,
      itemCount: exact ? scan.count : undefined,
      imageCount: exact ? scan.imageCount : undefined,
      videoCount: exact ? scan.videoCount : undefined,
      gifCount: exact ? scan.gifCount : undefined,
      folderCount: scan.subFolderIds.length,
      modifiedTime: scan.newestTime,
    };
  } catch {
    return emptySummary();
  }
}

/** Ringkasan menyeluruh: hitungan dan sampul mencakup seluruh subfolder. */
async function summarizeAlbumFull(
  albumId: string,
  budget: { remaining: number },
  depth = 0,
): Promise<AlbumSummary> {
  try {
    const scan = await scanFolder(albumId, "full");
    const coverUrls = [...scan.coverUrls];
    let count = scan.count;
    let imageCount = scan.imageCount;
    let videoCount = scan.videoCount;
    let gifCount = scan.gifCount;
    let newestTime = scan.newestTime;
    let exact = scan.exact;

    const affordable =
      depth + 1 < MAX_ALBUM_DEPTH
        ? scan.subFolderIds.slice(0, Math.max(0, budget.remaining))
        : [];
    if (affordable.length < scan.subFolderIds.length) exact = false;
    budget.remaining -= affordable.length;

    const children = await mapPool(affordable, SUMMARY_CONCURRENCY, (id) =>
      summarizeAlbumFull(id, budget, depth + 1),
    );

    for (const child of children) {
      if (typeof child.itemCount === "number") {
        count += child.itemCount;
        imageCount += child.imageCount ?? 0;
        videoCount += child.videoCount ?? 0;
        gifCount += child.gifCount ?? 0;
      } else {
        exact = false;
      }
      for (const url of child.thumbnailUrls ?? []) {
        if (coverUrls.length < 4) coverUrls.push(url);
      }
      if (child.modifiedTime && (!newestTime || child.modifiedTime > newestTime)) {
        newestTime = child.modifiedTime;
      }
    }

    return {
      thumbnailUrl: coverUrls[0],
      thumbnailUrls: coverUrls,
      itemCount: exact ? count : undefined,
      imageCount: exact ? imageCount : undefined,
      videoCount: exact ? videoCount : undefined,
      gifCount: exact ? gifCount : undefined,
      folderCount: scan.subFolderIds.length,
      modifiedTime: newestTime,
    };
  } catch {
    return emptySummary();
  }
}

async function summarizeAlbum(
  albumId: string,
  mode: "lite" | "full",
  budget?: { remaining: number },
) {
  return mode === "lite"
    ? summarizeAlbumLite(albumId)
    : summarizeAlbumFull(albumId, budget ?? { remaining: TREE_FOLDER_BUDGET });
}

function toMediaItem(file: drive_v3.Schema$File, type: MediaType): MediaItem {
  const id = file.id!;
  if (file.thumbnailLink) thumbnailLinkCache.set(id, file.thumbnailLink);
  const durationRaw = file.videoMediaMetadata?.durationMillis;
  const durationMs = durationRaw ? Number(durationRaw) : undefined;
  return {
    id,
    name: file.name!,
    type,
    mimeType: file.mimeType!,
    thumbnailUrl: thumbUrl(id, THUMB.grid),
    previewUrl:
      type === "image" ? thumbUrl(id, THUMB.view) : `/api/media/${id}/file`,
    downloadUrl: `/api/media/${id}/download`,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    albumId: file.parents?.[0] ?? undefined,
    modifiedTime: file.modifiedTime ?? undefined,
  };
}

/** Subfolder langsung dari satu atau beberapa induk sekaligus. */
async function listChildFolders(parentIds: string[]): Promise<FolderRef[]> {
  if (parentIds.length === 0) return [];
  const drive = getDrive();

  const groups = await mapPool(
    chunk(parentIds, PARENT_QUERY_CHUNK),
    4,
    async (ids) => {
      const parents = ids.map((id) => `'${id}' in parents`).join(" or ");
      const found: FolderRef[] = [];
      let pageToken: string | undefined;

      do {
        const { data }: { data: drive_v3.Schema$FileList } = await withListSlot(
          () =>
            drive.files.list({
              q: `(${parents}) and mimeType = '${FOLDER_MIME}' and trashed = false`,
              fields: "nextPageToken, files(id, name, parents, modifiedTime)",
              orderBy: "name",
              pageSize: 100,
              pageToken,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            }),
        );
        for (const file of data.files ?? []) {
          if (!file.id || !file.name) continue;
          found.push({
            id: file.id,
            name: file.name,
            parentId: file.parents?.[0] ?? undefined,
            modifiedTime: file.modifiedTime ?? undefined,
          });
        }
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken);

      return found;
    },
  );

  const folders = groups.flat();
  for (const folder of folders) rememberAlbumId(folder.id);
  return folders;
}

async function listAlbumsFromDrive(mode: "lite" | "full"): Promise<Album[]> {
  try {
    const folders = await listChildFolders([getRootFolderId()]);
    const budget = { remaining: TREE_FOLDER_BUDGET };
    const albums = await mapPool(folders, SUMMARY_CONCURRENCY, async (folder) =>
      toAlbum(folder, await summarizeAlbum(folder.id, mode, budget)),
    );
    return sortAlbumsByRecent(albums);
  } catch (err) {
    throw mapGoogleError(err);
  }
}

async function listSubAlbumsFromDrive(albumId: string): Promise<Album[]> {
  try {
    const folders = await listChildFolders([albumId]);
    const budget = { remaining: SUBTREE_FOLDER_BUDGET };
    const albums = await mapPool(folders, SUMMARY_CONCURRENCY, async (folder) =>
      toAlbum(folder, await summarizeAlbumFull(folder.id, budget)),
    );
    return sortAlbumsByRecent(albums);
  } catch (err) {
    throw mapGoogleError(err);
  }
}

export async function getAlbums(fresh = false, opts: { details?: boolean } = {}) {
  const details = Boolean(opts.details);
  const load = () => listAlbumsFromDrive(details ? "full" : "lite");
  if (fresh) {
    revalidateTag("albums");
    return load();
  }
  return unstable_cache(load, [details ? "albums-v7-full" : "albums-v7-lite"], {
    tags: ["albums"],
    revalidate: details ? 600 : 180,
  })();
}

async function listMediaFromDrive(
  albumId: string,
  pageToken: string | undefined,
  typeFilter: string | undefined,
  options: { skipAssert?: boolean } = {},
) {
  if (!options.skipAssert) {
    await assertAlbum(albumId);
  }
  const mimeQuery = mimeQueryFor(typeFilter);

  try {
    const drive = getDrive();
    const { data } = await drive.files.list({
      q: `'${albumId}' in parents and trashed = false and ${mimeQuery}`,
      fields:
        "nextPageToken, files(id, name, mimeType, thumbnailLink, parents, modifiedTime, videoMediaMetadata(durationMillis))",
      orderBy: "modifiedTime desc",
      pageSize: PAGE_SIZE,
      pageToken: pageToken || undefined,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const items = (data.files ?? [])
      .map((file) => {
        if (!file.id || !file.name || !file.mimeType) return null;
        const type = mediaTypeFromMime(file.mimeType);
        if (!type) return null;
        return toMediaItem(file, type);
      })
      .filter((item): item is MediaItem => item !== null);

    return {
      items,
      nextPageToken: data.nextPageToken ?? undefined,
    };
  } catch (err) {
    throw mapGoogleError(err);
  }
}

/** Semua folder di bawah root, level demi level, dengan batas kedalaman dan jumlah. */
async function listAlbumTree(): Promise<FolderRef[]> {
  const all: FolderRef[] = [];
  const seen = new Set<string>();
  let level = [getRootFolderId()];

  for (let depth = 0; depth < MAX_ALBUM_DEPTH && level.length > 0; depth += 1) {
    const children = await listChildFolders(level);
    const fresh = children.filter((folder) => !seen.has(folder.id));
    if (fresh.length === 0) break;

    for (const folder of fresh) {
      seen.add(folder.id);
      all.push(folder);
      if (all.length >= TREE_FOLDER_BUDGET) return all;
    }
    level = fresh.map((folder) => folder.id);
  }

  return all;
}

async function getAlbumFolders(fresh = false) {
  if (fresh) {
    revalidateTag("albums");
    return listAlbumTree();
  }
  return unstable_cache(listAlbumTree, ["album-tree-v1"], {
    tags: ["albums"],
    revalidate: 300,
  })();
}

function mapListedFiles(files: drive_v3.Schema$File[] | undefined) {
  return (files ?? [])
    .map((file) => {
      if (!file.id || !file.name || !file.mimeType) return null;
      const type = mediaTypeFromMime(file.mimeType);
      if (!type) return null;
      return toMediaItem(file, type);
    })
    .filter((item): item is MediaItem => item !== null);
}

async function listMediaInParents(
  albumIds: string[],
  typeFilter: string | undefined,
) {
  if (albumIds.length === 0) return { items: [] as MediaItem[], total: 0 };

  const drive = getDrive();
  const groups = await mapPool(
    chunk(albumIds, PARENT_QUERY_CHUNK),
    4,
    async (ids) => {
      const parents = ids.map((id) => `'${id}' in parents`).join(" or ");
      const found: MediaItem[] = [];
      let pageToken: string | undefined;

      do {
        const { data }: { data: drive_v3.Schema$FileList } = await withListSlot(
          () =>
            drive.files.list({
              q: `(${parents}) and trashed = false and ${mimeQueryFor(typeFilter)}`,
              fields:
                "nextPageToken, files(id, name, mimeType, thumbnailLink, parents, modifiedTime, videoMediaMetadata(durationMillis))",
              orderBy: "modifiedTime desc",
              pageSize: 100,
              pageToken,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            }),
        );
        found.push(...mapListedFiles(data.files));
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken && found.length < LIBRARY_MAX_ITEMS);

      return found;
    },
  );

  const seen = new Set<string>();
  const items = groups
    .flat()
    .filter((item) => (seen.has(item.id) ? false : seen.add(item.id)))
    .sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""))
    .slice(0, LIBRARY_MAX_ITEMS);

  return { items, total: items.length };
}

/** Album cocok bila namanya cocok, atau bila ia berada di dalam album yang cocok. */
function filterFoldersByPattern(folders: FolderRef[], pattern: RegExp) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const verdict = new Map<string, boolean>();

  const matches = (folder: FolderRef): boolean => {
    const cached = verdict.get(folder.id);
    if (cached !== undefined) return cached;
    verdict.set(folder.id, false);
    const parent = folder.parentId ? byId.get(folder.parentId) : undefined;
    const result =
      pattern.test(folder.name) || (parent ? matches(parent) : false);
    verdict.set(folder.id, result);
    return result;
  };

  return folders.filter(matches);
}

export async function getLibraryMedia(opts: {
  type?: LibraryKind;
  collection?: string;
  fresh?: boolean;
}) {
  const typeKey = opts.type ?? "all";
  const collectionKey = opts.collection ?? "all";

  const load = async () => {
    let folders = await getAlbumFolders(false);
    if (opts.collection) {
      const def = getCollectionDef(opts.collection);
      if (!def) {
        throw new AppError("not_found", MESSAGES.notFound, 404);
      }
      folders = filterFoldersByPattern(folders, def.pattern);
    }

    const typeFilter = opts.type === "gif" ? "image" : opts.type;
    const listed = await listMediaInParents(
      folders.map((folder) => folder.id),
      typeFilter,
    );
    const items =
      opts.type === "gif"
        ? listed.items.filter((item) => item.mimeType === "image/gif")
        : listed.items;

    return { items, total: items.length };
  };

  if (opts.fresh) {
    revalidateTag("albums");
    return load();
  }

  return unstable_cache(load, ["library-v4", typeKey, collectionKey], {
    tags: ["albums"],
    revalidate: 600,
  })();
}

export async function getAlbumWithMedia(
  albumId: string,
  pageToken: string | undefined,
  typeFilter: string | undefined,
  fresh = false,
) {
  const breadcrumb = await getAlbumTrail(albumId);
  const albumFile = await getFileMetadata(albumId);
  const tag = `album-${albumId}`;

  if (fresh) {
    revalidateTag(tag);
  }

  const loadMedia = () =>
    listMediaFromDrive(albumId, pageToken, typeFilter, { skipAssert: true });
  const loadSubAlbums = () => listSubAlbumsFromDrive(albumId);

  // Subalbum hanya relevan di halaman pertama; halaman berikutnya murni media.
  const subAlbumsTask: Promise<Album[]> = pageToken
    ? Promise.resolve([])
    : fresh
      ? loadSubAlbums()
      : unstable_cache(loadSubAlbums, ["sub-albums-v1", albumId], {
          tags: [tag, "albums"],
          revalidate: 600,
        })();

  const mediaTask =
    fresh || pageToken
      ? loadMedia()
      : unstable_cache(loadMedia, ["media-v6", albumId, typeFilter ?? "all"], {
          tags: [tag, "albums"],
          revalidate: 600,
        })();

  const [listed, subAlbums] = await Promise.all([mediaTask, subAlbumsTask]);

  const album = toAlbum(
    {
      id: albumId,
      name: albumFile.name!,
      modifiedTime: albumFile.modifiedTime ?? undefined,
    },
    { folderCount: pageToken ? undefined : subAlbums.length },
  );

  return {
    album,
    breadcrumb,
    subAlbums,
    ...listed,
    total: listed.nextPageToken ? undefined : listed.items.length,
  };
}

export async function getMediaMeta(fileId: string) {
  const { file, type, albumId } = await assertMediaAccessible(fileId);
  return {
    albumId,
    media: toMediaItem(file, type),
    thumbnailLink: file.thumbnailLink ?? null,
    mimeType: file.mimeType!,
    name: file.name!,
    size: Number(file.size ?? 0),
  };
}

let tokenCache: { token: string; at: number } | null = null;

export async function getAccessToken() {
  if (tokenCache && Date.now() - tokenCache.at < 50 * 60 * 1000) {
    return tokenCache.token;
  }
  const auth = getAuth();
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const token =
    typeof tokenResponse === "string" ? tokenResponse : tokenResponse?.token;
  if (!token) {
    throw new AppError("drive", MESSAGES.drive, 502);
  }
  tokenCache = { token, at: Date.now() };
  return token;
}

export async function getFileStream(
  fileId: string,
  range?: string | null,
  options?: { alreadyVerified?: boolean },
) {
  if (!options?.alreadyVerified) {
    await assertMediaAccessible(fileId);
  }
  try {
    const drive = getDrive();
    const headers: Record<string, string> = {};
    if (range) headers.Range = range;

    const res = await drive.files.get(
      {
        fileId,
        alt: "media",
        supportsAllDrives: true,
      },
      {
        responseType: "stream",
        headers,
      },
    );

    return {
      stream: res.data as Readable,
      status: res.status ?? 200,
      headers: res.headers as Record<string, string | number | undefined>,
    };
  } catch (err) {
    throw mapGoogleError(err);
  }
}

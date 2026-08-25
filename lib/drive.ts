import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { google, type drive_v3 } from "googleapis";
import { revalidateTag, unstable_cache } from "next/cache";
import { AppError, MESSAGES } from "@/lib/errors";
import { getCollectionDef, sortAlbumsByRecent } from "@/lib/collections";
import type { Album, LibraryKind, MediaItem, MediaType } from "@/lib/types";

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
const COUNT_PAGE_SIZE = 100;
const COUNT_MAX_PAGES = 10;
const LIBRARY_MAX_ITEMS = 2000;
const META_TTL_MS = 60_000;

let driveClient: drive_v3.Drive | null = null;
const fileMetaCache = new Map<string, { at: number; data: drive_v3.Schema$File }>();
const thumbnailLinkCache = new Map<string, string>();

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
    if (fileMetaCache.size > 400) {
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

export async function assertAlbum(albumId: string) {
  const file = await getFileMetadata(albumId);
  if (file.trashed || file.mimeType !== FOLDER_MIME || !file.id || !file.name) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }
  const rootId = getRootFolderId();
  if (!file.parents?.includes(rootId)) {
    throw new AppError("not_found", MESSAGES.notFound, 404);
  }
  return file;
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
  await assertAlbum(parentId);
  return { file, type, albumId: parentId };
}

function toAlbum(
  file: drive_v3.Schema$File,
  extra: {
    thumbnailUrl?: string;
    thumbnailUrls?: string[];
    itemCount?: number;
    imageCount?: number;
    videoCount?: number;
    gifCount?: number;
    modifiedTime?: string;
  } = {},
): Album {
  return {
    id: file.id!,
    name: file.name!,
    thumbnailUrl: extra.thumbnailUrl,
    thumbnailUrls: extra.thumbnailUrls,
    itemCount: extra.itemCount,
    imageCount: extra.imageCount,
    videoCount: extra.videoCount,
    gifCount: extra.gifCount,
    modifiedTime: extra.modifiedTime ?? file.modifiedTime ?? undefined,
  };
}

function mimeQueryFor(typeFilter?: string) {
  if (typeFilter === "image") return "mimeType contains 'image/'";
  if (typeFilter === "video") return "mimeType contains 'video/'";
  if (typeFilter === "gif") return "mimeType = 'image/gif'";
  return "(mimeType contains 'image/' or mimeType contains 'video/')";
}

function thumbUrl(id: string) {
  return `/api/media/${id}/thumbnail?s=800`;
}

/** Ambil cover + jumlah media album dalam satu rangkaian request. */
async function getAlbumSummary(albumId: string, typeFilter?: string) {
  try {
    const drive = getDrive();
    const coverIds: string[] = [];
    let count = 0;
    let imageCount = 0;
    let videoCount = 0;
    let gifCount = 0;
    let newestTime: string | undefined;
    let pageToken: string | undefined;

    for (let page = 0; page < COUNT_MAX_PAGES; page += 1) {
      const { data }: { data: drive_v3.Schema$FileList } =
        await drive.files.list({
          q: `'${albumId}' in parents and trashed = false and ${mimeQueryFor(typeFilter)}`,
          fields: "nextPageToken, files(id, mimeType, modifiedTime, thumbnailLink)",
          orderBy: "modifiedTime desc",
          pageSize: COUNT_PAGE_SIZE,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });

      for (const file of data.files ?? []) {
        if (!file.id || !file.mimeType) continue;
        const type = mediaTypeFromMime(file.mimeType);
        if (!type) continue;
        count += 1;
        if (type === "video") videoCount += 1;
        else {
          imageCount += 1;
          if (file.mimeType === "image/gif") gifCount += 1;
        }
        if (coverIds.length < 4) {
          coverIds.push(file.id);
          if (file.thumbnailLink) thumbnailLinkCache.set(file.id, file.thumbnailLink);
        }
        newestTime ??= file.modifiedTime ?? undefined;
      }

      pageToken = data.nextPageToken ?? undefined;
      if (!pageToken) break;
    }

    return {
      thumbnailUrl: coverIds[0] ? thumbUrl(coverIds[0]) : undefined,
      thumbnailUrls: coverIds.map(thumbUrl),
      itemCount: count,
      imageCount,
      videoCount,
      gifCount,
      modifiedTime: newestTime,
    };
  } catch {
    return {
      thumbnailUrl: undefined,
      thumbnailUrls: undefined,
      itemCount: undefined,
      imageCount: undefined,
      videoCount: undefined,
      gifCount: undefined,
      modifiedTime: undefined,
    };
  }
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
    thumbnailUrl: thumbUrl(id),
    previewUrl: `/api/media/${id}/file`,
    downloadUrl: `/api/media/${id}/download`,
    durationMs: Number.isFinite(durationMs) ? durationMs : undefined,
    albumId: file.parents?.[0] ?? undefined,
    modifiedTime: file.modifiedTime ?? undefined,
  };
}

async function listAlbumsFromDrive(): Promise<Album[]> {
  try {
    const drive = getDrive();
    const rootId = getRootFolderId();
    const { data } = await drive.files.list({
      q: `'${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
      fields: "files(id, name, mimeType, parents, modifiedTime)",
      orderBy: "name",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const folders = (data.files ?? []).filter((file) => file.id && file.name);
    const albums = await Promise.all(
      folders.map(async (file) =>
        toAlbum(file, await getAlbumSummary(file.id!)),
      ),
    );
    return sortAlbumsByRecent(albums);
  } catch (err) {
    throw mapGoogleError(err);
  }
}

export async function getAlbums(fresh = false) {
  if (fresh) {
    revalidateTag("albums");
    return listAlbumsFromDrive();
  }
  return unstable_cache(listAlbumsFromDrive, ["albums-v4"], {
    tags: ["albums"],
    revalidate: 300,
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

async function listAlbumFolders() {
  const drive = getDrive();
  const rootId = getRootFolderId();
  const { data } = await drive.files.list({
    q: `'${rootId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id, name)",
    orderBy: "name",
    pageSize: 100,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  return (data.files ?? []).filter(
    (file): file is drive_v3.Schema$File & { id: string; name: string } =>
      Boolean(file.id && file.name),
  );
}

async function getAlbumFolders(fresh = false) {
  if (fresh) {
    revalidateTag("albums");
    return listAlbumFolders();
  }
  return unstable_cache(listAlbumFolders, ["album-folders-v1"], {
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
  const parents = albumIds.map((id) => `'${id}' in parents`).join(" or ");
  const items: MediaItem[] = [];
  let pageToken: string | undefined;

  do {
    const { data } = await drive.files.list({
      q: `(${parents}) and trashed = false and ${mimeQueryFor(typeFilter)}`,
      fields:
        "nextPageToken, files(id, name, mimeType, thumbnailLink, parents, modifiedTime, videoMediaMetadata(durationMillis))",
      orderBy: "modifiedTime desc",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    items.push(...mapListedFiles(data.files));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken && items.length < LIBRARY_MAX_ITEMS);

  return { items, total: items.length };
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
      folders = folders.filter((folder) => def.pattern.test(folder.name));
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

  return unstable_cache(load, ["library-v2", typeKey, collectionKey], {
    tags: ["albums"],
    revalidate: 300,
  })();
}

export async function getAlbumWithMedia(
  albumId: string,
  pageToken: string | undefined,
  typeFilter: string | undefined,
  fresh = false,
) {
  const albumFile = await assertAlbum(albumId);
  const album = toAlbum(albumFile);
  const tag = `album-${albumId}`;

  if (fresh) {
    revalidateTag(tag);
  }

  const load = () => listMediaFromDrive(albumId, pageToken, typeFilter);

  if (fresh || pageToken) {
    const listed = await load();
    return {
      album,
      ...listed,
      total: listed.nextPageToken ? undefined : listed.items.length,
    };
  }

  const listed = await unstable_cache(
    load,
    ["media-v4", albumId, typeFilter ?? "all"],
    { tags: [tag, "albums"], revalidate: 300 },
  )();

  return {
    album,
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

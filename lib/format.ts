export function formatDuration(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatItemCount(
  count: number,
  kind: "item" | "foto" | "video" = "item",
) {
  return `${count.toLocaleString("id-ID")} ${kind}`;
}

export function formatFolderCount(count: number) {
  return `${count.toLocaleString("id-ID")} folder`;
}

/**
 * Baris keterangan kartu album.
 * - Tanpa subfolder: "243 item"
 * - Hanya subfolder: "3 folder"
 * - Ada subfolder + item: "2 folder dan 310 item" (item = isi langsung album, bukan isi folder anak)
 */
export function formatAlbumMeta(album: {
  itemCount?: number;
  folderCount?: number;
}) {
  const folders = album.folderCount ?? 0;
  const items = album.itemCount;

  if (typeof items !== "number") {
    return folders > 0 ? formatFolderCount(folders) : "";
  }
  if (folders > 0 && items > 0) {
    return `${formatFolderCount(folders)} dan ${formatItemCount(items)}`;
  }
  if (folders > 0) {
    return formatFolderCount(folders);
  }
  return formatItemCount(items);
}

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

/** Baris keterangan kartu album: jumlah subfolder lebih dulu, lalu jumlah media. */
export function formatAlbumMeta(album: {
  itemCount?: number;
  folderCount?: number;
}) {
  const folders = album.folderCount ?? 0;
  const items = album.itemCount;

  if (folders > 0) {
    const label = formatFolderCount(folders);
    return items ? `${label} \u00b7 ${formatItemCount(items)}` : label;
  }
  return typeof items === "number" ? items.toLocaleString("id-ID") : "";
}

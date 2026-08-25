export type Album = {
  id: string;
  name: string;
  thumbnailUrl?: string;
  thumbnailUrls?: string[];
  itemCount?: number;
  imageCount?: number;
  videoCount?: number;
  gifCount?: number;
  modifiedTime?: string;
};

export type MediaType = "image" | "video";

export type MediaItem = {
  id: string;
  name: string;
  type: MediaType;
  mimeType: string;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  durationMs?: number;
  albumId?: string;
  modifiedTime?: string;
};

export type AlbumsResponse = {
  albums: Album[];
};

export type MediaListResponse = {
  album?: Album;
  items: MediaItem[];
  nextPageToken?: string;
  total?: number;
};

export type LibraryMediaResponse = {
  items: MediaItem[];
  total: number;
};

export type MediaMetaResponse = {
  albumId: string;
  media: MediaItem;
};

export type ApiErrorBody = {
  error: string;
  message: string;
};

export type LibraryKind = "image" | "video" | "gif";

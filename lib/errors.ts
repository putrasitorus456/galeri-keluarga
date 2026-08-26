export class AppError extends Error {
  constructor(
    public code:
      | "unauthorized"
      | "invalid_pin"
      | "not_found"
      | "drive"
      | "config"
      | "bad_request",
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const MESSAGES = {
  unauthorized: "Sesi Anda sudah berakhir. Silakan masuk kembali.",
  invalidPin: "PIN salah. Coba lagi.",
  drive: "Foto sedang tidak dapat dimuat. Coba lagi beberapa saat lagi.",
  config:
    "Aplikasi belum terhubung ke Google Drive. Periksa konfigurasi server.",
  notFound: "Foto/video ini tidak dapat dibuka.",
  videoUnsupported:
    "Video ini tidak dapat diputar di browser Anda. Coba unduh videonya.",
  videoTooLarge:
    "Video ini terlalu besar untuk dikonversi. Silakan unduh untuk menontonnya.",
  albumEmpty: "Belum ada foto di album ini.",
  albumsEmpty: "Belum ada album.",
  network: "Tidak dapat terhubung ke internet. Coba lagi.",
  offlineTitle: "Tidak ada koneksi internet.",
  offlineBody:
    "Foto dan video membutuhkan koneksi internet. Silakan coba lagi setelah terhubung.",
} as const;

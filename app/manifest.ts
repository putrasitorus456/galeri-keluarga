import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Album Kita",
    short_name: "Album Kita",
    description: "Galeri foto dan video keluarga.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    // Dipakai navigator.getInstalledRelatedApps() untuk mendeteksi apakah PWA ini
    // sudah terpasang saat halaman dibuka dari browser biasa.
    prefer_related_applications: false,
    related_applications: [
      {
        platform: "webapp",
        url: "/manifest.webmanifest",
      },
    ],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

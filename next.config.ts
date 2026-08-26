import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  additionalPrecacheEntries: [
    { url: "/offline", revision: "foto-keluarga-offline-1" },
  ],
});

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "googleapis",
    "heic-convert",
    "heic-decode",
    "libheif-js",
    "ffmpeg-static",
    "ffprobe-static",
  ],
};

export default withSerwist(nextConfig);

import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkOnly, RangeRequestsPlugin, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin &&
        /^\/api\/media\/[^/]+\/thumbnail\/?$/.test(url.pathname) &&
        !request.headers.has("range"),
      handler: new CacheFirst({
        cacheName: "gallery-media-thumbs-v2",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 400,
            maxAgeSeconds: 60 * 60 * 24 * 7,
            maxAgeFrom: "last-used",
          }),
          new RangeRequestsPlugin(),
        ],
      }),
    },
    {
      matcher: ({ url, sameOrigin }) =>
        sameOrigin && url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

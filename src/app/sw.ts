/// <reference lib="webworker" />

import {
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type RuntimeCaching,
  type SerwistGlobalConfig,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const runtimeCaching: RuntimeCaching[] = [
  // Page navigations: try the network first with a 3s budget, fall back to
  // the last cached HTML if the network is slow or offline. This is the
  // safety net for short network drops.
  {
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkFirst({
      cacheName: "navigations",
      networkTimeoutSeconds: 3,
    }),
  },
  // App-shell static assets (JS, CSS, fonts): serve cache instantly, refresh
  // in the background so the next load picks up the new bundle.
  {
    matcher: ({ request }) =>
      request.destination === "script" ||
      request.destination === "style" ||
      request.destination === "font",
    handler: new StaleWhileRevalidate({
      cacheName: "static-assets",
    }),
  },
  // Images (logo, song icons, etc.) — same stale-while-revalidate pattern.
  {
    matcher: ({ request }) => request.destination === "image",
    handler: new StaleWhileRevalidate({
      cacheName: "images",
    }),
  },
  // Anything else (Supabase auth, server actions, realtime, mutations) is
  // intentionally NOT matched — it passes through to the network with no
  // caching. Non-GET requests are skipped automatically by the strategies above.
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST ?? [],
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
});

serwist.addEventListeners();

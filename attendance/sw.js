// Minimal service worker — required for the browser to treat this as an
// installable app. Deliberately does NOT cache anything, so the app always
// loads the latest version from GitHub (no stale-version confusion).
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Pass-through — always fetch fresh from network, never serve from cache.
  e.respondWith(fetch(e.request));
});

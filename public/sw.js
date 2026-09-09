"use strict";

const CACHE_NAME = "trios-public-shell-v1";
const CACHE_PREFIX = "trios-public-shell-";
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [
  OFFLINE_URL,
  "/favicon.svg",
  "/brand/trios-logo.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-512.png",
  "/pwa/apple-touch-icon-180.png",
];
const PRIVATE_ROUTE = /^\/(?:api|auth|operations|crew|portal|staff|sign-in|sign-out)(?:\/|$)/i;
const NEXT_DATA_ROUTE = /^\/_next\/(?:data|image)(?:\/|$)/i;

function decodedPathname(pathname) {
  let decoded = pathname;
  for (let index = 0; index < 2; index += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded.replace(/\/{2,}/g, "/");
}

function isRscRequest(request, url) {
  const accept = request.headers.get("accept") || "";
  return (
    url.searchParams.has("_rsc") ||
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch") ||
    accept.includes("text/x-component")
  );
}

function shouldUseNetworkOnly(request, url) {
  const pathname = decodedPathname(url.pathname);
  return (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    PRIVATE_ROUTE.test(pathname) ||
    NEXT_DATA_ROUTE.test(pathname) ||
    request.headers.has("authorization") ||
    request.headers.has("cookie") ||
    request.headers.has("range") ||
    isRscRequest(request, url)
  );
}

function canStore(response) {
  const cacheControl = response.headers.get("cache-control") || "";
  const contentType = response.headers.get("content-type") || "";
  return (
    response.ok &&
    response.type !== "opaque" &&
    !/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/i.test(cacheControl) &&
    !response.headers.has("set-cookie") &&
    !contentType.includes("text/x-component")
  );
}

async function cachedPublicAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (canStore(response)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

async function publicNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (
      (await caches.match(OFFLINE_URL)) ||
      new Response("Trios is offline. Please reconnect and try again.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    );
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (shouldUseNetworkOnly(request, url)) return;

  if (request.mode === "navigate") {
    event.respondWith(publicNavigation(request));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(cachedPublicAsset(request));
  }
});

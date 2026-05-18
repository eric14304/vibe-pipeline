// SW build marker v6 — change to trigger update banner
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { StaleWhileRevalidate, CacheFirst, NetworkOnly } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// vite-plugin-pwa injectManifest 注入點:build 時被取代成 precache manifest array
precacheAndRoute(self.__WB_MANIFEST || []);

// SPA navigation fallback → precached /index.html(offline 也能進畫面)
registerRoute(new NavigationRoute(createHandlerBoundToURL("/index.html")));

// /api/health → NetworkOnly(useOnlineStatus 真實偵測用,不能走 cache 否則離線時 cache hit 偽 online)
// **必須在 /api/* SWR 之前 register**(Workbox route match first-match-win)
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname === "/api/health",
  new NetworkOnly()
);

// /api/* GET → NetworkOnly(避免 polling endpoint「先顯舊再閃新」flicker);非 GET 也直通網路
registerRoute(
  ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/"),
  new NetworkOnly()
);

// Google Fonts CSS
registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
    plugins: [new CacheableResponsePlugin({ statuses: [0, 200] })],
  })
);

// Google Fonts files(woff2 etc)
registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 7 * 24 * 3600 }),
    ],
  })
);

// DEBUG:暫時拔掉 firebase importScripts + ensureMessaging 邏輯,排除 evaluation failed
// 是否來自 importScripts() 跨 origin 拿 firebase compat。push 走原生 push event handler(下方留)。
// 若拔掉後 SW 能起來 → firebase importScripts 是元兇,改方案:用 firebase modular API + vite bundle。
// importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
// importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

async function ensureMessaging() {
  // noop — firebase SDK 暫時不載
  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.resolve());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await ensureMessaging();
      } catch (e) {
        console.error("[sw] activate init failed", e);
      }
      // 清掉舊版 SW 留下的 api-cache(v6 起 /api/* 改 NetworkOnly,不再使用此 cache)
      try {
        await caches.delete("api-cache");
      } catch (e) {
        console.error("[sw] delete api-cache failed", e);
      }
      await self.clients.claim();
    })()
  );
});

// Push event:explicit handler 自己 showNotification。不依賴 FCM SDK 自動顯示
// (notification + data 混合 payload 在 Chrome 上 SW 不一定 auto-display)
self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let title = "Vibe Pipeline";
      let body = "";
      let data = {};
      try {
        const raw = event.data ? event.data.json() : null;
        if (raw) {
          title = raw.notification?.title || raw.data?.title || title;
          body = raw.notification?.body || raw.data?.body || body;
          data = raw.data || {};
        }
      } catch (e) {
        console.error("[sw] failed to parse push payload", e);
      }
      await self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data,
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        try {
          const url = new URL(client.url);
          const t = new URL(target, self.location.origin);
          if (url.origin === t.origin) {
            await client.focus();
            if (url.pathname + url.search !== t.pathname + t.search) {
              if ("navigate" in client) {
                try {
                  await client.navigate(t.href);
                } catch {}
              }
            }
            return;
          }
        } catch {}
      }
      await self.clients.openWindow(target);
    })()
  );
});

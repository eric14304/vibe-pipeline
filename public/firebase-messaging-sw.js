import { precacheAndRoute } from "workbox-precaching";

// vite-plugin-pwa injectManifest 注入點:build 時被取代成 precache manifest array
precacheAndRoute(self.__WB_MANIFEST || []);

importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.13.0/firebase-messaging-compat.js");

let messagingInstance = null;

async function ensureMessaging() {
  if (messagingInstance) return messagingInstance;
  const res = await fetch("/api/push/config");
  if (!res.ok) throw new Error("failed to fetch /api/push/config");
  const cfg = await res.json();
  if (!firebase.apps || firebase.apps.length === 0) {
    firebase.initializeApp({
      apiKey: cfg.apiKey,
      authDomain: cfg.authDomain,
      projectId: cfg.projectId,
      storageBucket: cfg.storageBucket,
      messagingSenderId: cfg.messagingSenderId,
      appId: cfg.appId,
    });
  }
  messagingInstance = firebase.messaging();
  messagingInstance.onBackgroundMessage((payload) => {
    const title =
      (payload.notification && payload.notification.title) ||
      (payload.data && payload.data.title) ||
      "Vibe Pipeline";
    const body =
      (payload.notification && payload.notification.body) ||
      (payload.data && payload.data.body) ||
      "";
    const data = payload.data || {};
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data,
    });
  });
  return messagingInstance;
}

self.addEventListener("install", (event) => {
  event.waitUntil(ensureMessaging().catch((e) => console.error("[sw] init failed", e)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await ensureMessaging();
      } catch (e) {
        console.error("[sw] activate init failed", e);
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

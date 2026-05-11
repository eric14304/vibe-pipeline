import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
  type MessagePayload,
} from "firebase/messaging";

type FcmConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "fcm_token";

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;
let config: FcmConfig | null = null;
let initPromise: Promise<Messaging | null> | null = null;

async function fetchConfig(): Promise<FcmConfig> {
  const res = await fetch(`${API_BASE_URL}/api/push/config`);
  if (!res.ok) throw new Error("無法取得 push config");
  return (await res.json()) as FcmConfig;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getPermission(): NotificationPermission {
  if (typeof Notification === "undefined") return "denied";
  return Notification.permission;
}

export function isFcmSupported(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (!("serviceWorker" in navigator) || typeof Notification === "undefined") {
    return Promise.resolve(false);
  }
  return isSupported().catch(() => false);
}

export async function initFCM(): Promise<Messaging | null> {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const supported = await isFcmSupported();
      if (!supported) return null;
      const cfg = await fetchConfig();
      if (!cfg.apiKey || !cfg.projectId || !cfg.appId) {
        console.warn("[fcm] config 缺欄位,跳過初始化");
        return null;
      }
      config = cfg;
      const existing = getApps();
      app =
        existing.length > 0
          ? existing[0]
          : initializeApp({
              apiKey: cfg.apiKey,
              authDomain: cfg.authDomain,
              projectId: cfg.projectId,
              storageBucket: cfg.storageBucket,
              messagingSenderId: cfg.messagingSenderId,
              appId: cfg.appId,
            });
      messaging = getMessaging(app);
      return messaging;
    } catch (e) {
      console.error("[fcm] initFCM 失敗", e);
      return null;
    }
  })();
  return initPromise;
}

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
}

export async function requestAndRegisterToken(): Promise<string> {
  const m = await initFCM();
  if (!m || !config) throw new Error("FCM 未初始化");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("通知權限未允許");
  const swReg = await registerServiceWorker();
  const token = await getToken(m, {
    vapidKey: config.vapidKey,
    serviceWorkerRegistration: swReg,
  });
  if (!token) throw new Error("取得 FCM token 失敗");
  try {
    const res = await fetch(`${API_BASE_URL}/api/push/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ token, platform: "web" }),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`register 失敗: ${res.status}`);
    }
  } catch (e) {
    console.warn("[fcm] /api/push/register 失敗,token 仍保留 local:", e);
  }
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
  return token;
}

export async function unregisterToken(): Promise<void> {
  const token = getStoredToken();
  const m = await initFCM();
  if (m) {
    try {
      await deleteToken(m);
    } catch (e) {
      console.warn("[fcm] deleteToken 失敗", e);
    }
  }
  if (token) {
    try {
      const res = await fetch(`${API_BASE_URL}/api/push/unregister`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok && res.status !== 404) {
        console.warn("[fcm] /api/push/unregister 回應", res.status);
      }
    } catch (e) {
      console.warn("[fcm] /api/push/unregister 失敗", e);
    }
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

export function setupForegroundHandler(cb: (payload: MessagePayload) => void): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void initFCM().then((m) => {
    if (cancelled || !m) return;
    unsub = onMessage(m, cb);
  });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

export type { MessagePayload };

import { useEffect, useState } from "react";
import { Workbox } from "workbox-window";

type Listener = (value: boolean) => void;

let wb: Workbox | null = null;
let needRefreshState = false;
let offlineReadyState = false;
const needRefreshListeners = new Set<Listener>();
const offlineReadyListeners = new Set<Listener>();
let initialized = false;

function setNeedRefresh(value: boolean) {
  needRefreshState = value;
  for (const fn of needRefreshListeners) fn(value);
}

function setOfflineReady(value: boolean) {
  offlineReadyState = value;
  for (const fn of offlineReadyListeners) fn(value);
}

type RegisterOpts = {
  onNeedRefresh?: () => void;
  onOfflineReady?: () => void;
};

export function registerSW(opts: RegisterOpts = {}) {
  if (initialized) return;
  initialized = true;

  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const swUrl = "/firebase-messaging-sw.js";
  // 明指 type:'classic' — SW build 用 IIFE format(vite.config.ts injectManifest.rollupFormat:'iife'),
  // 內含 importScripts() 載 firebase compat,只能在 classic SW 內合法。workbox-window 預設可能改 module 撞炸
  wb = new Workbox(swUrl, { type: "classic" });

  wb.addEventListener("waiting", () => {
    setNeedRefresh(true);
    opts.onNeedRefresh?.();
  });

  wb.addEventListener("activated", (event) => {
    if (!event.isUpdate) {
      setOfflineReady(true);
      opts.onOfflineReady?.();
    }
  });

  wb.addEventListener("controlling", () => {
    window.location.reload();
  });

  wb.register().catch((err) => {
    console.error("[swUpdate] register failed", err);
  });

  // workbox-window 預設只在 register 那一次 check update,之後不 polling。
  // PWA 切回 / 長期開著時也要能 detect 新版 → 兩條 trigger:
  // 1) 切回 visible 時(切 app 回來)
  // 2) 每 60s polling 一次(長期開著的 case)
  const checkUpdate = () => {
    if (wb && document.visibilityState === "visible") {
      wb.update().catch(() => {});
    }
  };
  document.addEventListener("visibilitychange", checkUpdate);
  setInterval(checkUpdate, 60_000);
}

export function updateSW() {
  if (!wb) {
    window.location.reload();
    return;
  }
  wb.messageSkipWaiting();
}

export function useSwUpdate() {
  const [needRefresh, setNeed] = useState(needRefreshState);
  const [offlineReady, setOffline] = useState(offlineReadyState);

  useEffect(() => {
    const nFn: Listener = (v) => setNeed(v);
    const oFn: Listener = (v) => setOffline(v);
    needRefreshListeners.add(nFn);
    offlineReadyListeners.add(oFn);
    setNeed(needRefreshState);
    setOffline(offlineReadyState);
    return () => {
      needRefreshListeners.delete(nFn);
      offlineReadyListeners.delete(oFn);
    };
  }, []);

  return {
    needRefresh,
    offlineReady,
    updateSW,
  };
}

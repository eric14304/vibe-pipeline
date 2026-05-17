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
  wb = new Workbox(swUrl);

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

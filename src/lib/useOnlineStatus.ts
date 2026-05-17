import { useEffect, useState } from "react";

// online/offline 雙層偵測:
// 1) navigator.onLine + online/offline event(系統層,連 wifi 報 online,可能 false positive)
// 2) backend ping /api/health 每 5s(只在 visible 時 polling 省電) — 真實偵測 backend 通否
// 任一報 offline 就 return false(更保守,避免假 online 騙 user)。
export function useOnlineStatus(): boolean {
  const [navOnline, setNavOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  const [backendOnline, setBackendOnline] = useState<boolean>(true);

  // (1) navigator online/offline event
  useEffect(() => {
    const on = () => setNavOnline(true);
    const off = () => setNavOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // (2) backend ping /api/health,visible 時 polling
  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      if (document.hidden) return;
      try {
        const ctrl = new AbortController();
        const timeout = setTimeout(() => ctrl.abort(), 4000);
        // cache: 'no-store' 避開 SW SWR cache(否則 cache hit 一直假 online)
        const res = await fetch("/api/health", { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(timeout);
        if (!cancelled) setBackendOnline(res.ok);
      } catch {
        if (!cancelled) setBackendOnline(false);
      }
    };

    ping();
    timerId = setInterval(ping, 5_000);

    // visibility 切回也 ping 一次
    const onVisible = () => { if (!document.hidden) ping(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      if (timerId) clearInterval(timerId);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return navOnline && backendOnline;
}

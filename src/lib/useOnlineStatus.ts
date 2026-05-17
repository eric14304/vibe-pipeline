import { useEffect, useState } from "react";

// 主執行緒 navigator.onLine + online/offline event。
// 不打 backend 確認(false positive 接受 — 連 wifi 但 backend 不通仍報 online);
// 真實 backend 不通會由 API call 失敗各自處理。
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator === "undefined" ? true : navigator.onLine
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

import { useEffect, useState } from "react";
import { useOnlineStatus } from "../lib/useOnlineStatus";
import "./online-status-badge.css";

// 上方中央 fixed badge:
// - offline 時持續顯「離線」
// - 切回 online 後顯「已連線」2.5s 然後 fade out
// - 一直 online(從沒掉過)→ 不顯
export function OnlineStatusBadge() {
  const online = useOnlineStatus();
  const [wasOffline, setWasOffline] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (!online) {
      setWasOffline(true);
      setShowReconnected(false);
      return;
    }
    // online + 之前掉過 → 顯「已連線」2.5s
    if (wasOffline) {
      setShowReconnected(true);
      const t = setTimeout(() => {
        setShowReconnected(false);
        setWasOffline(false);
      }, 2500);
      return () => clearTimeout(t);
    }
  }, [online, wasOffline]);

  if (online && !showReconnected) return null;

  return (
    <div
      className={
        "online-status-badge " + (online ? "is-reconnected" : "is-offline")
      }
      role="status"
      aria-live="polite"
    >
      {online ? "已連線" : "離線"}
    </div>
  );
}

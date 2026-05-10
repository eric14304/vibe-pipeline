import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { NotificationsScreen } from "./features/notifications/NotificationsScreen";
import { BoardScreen } from "./features/pipeline/BoardScreen";
import { InitScreen } from "./features/init/InitScreen";
import { DrawerStage, type DrawerState } from "./features/drawer/DrawerStage";
import { QAScreen, type QAVariant } from "./features/qa/QAScreen";
import { StatesGallery } from "./features/dev/StatesGallery";
import type { InboxFilter, InboxState } from "./types/notif";

// Theme priority: URL ?theme=  →  localStorage  →  default light
// (URL 留 pixel-diff variants / 分享連結 override;真正記住偏好走 localStorage)
function useTheme() {
  const [params] = useSearchParams();
  const urlTheme = params.get("theme");
  const dark =
    urlTheme === "dark" ||
    (urlTheme == null && readStoredTheme() === "dark");
  useEffect(() => {
    document.documentElement.classList.toggle("light", !dark);
  }, [dark]);
  return dark;
}

function readStoredTheme(): "dark" | "light" | null {
  try {
    const v = localStorage.getItem("vibe-pipeline:theme");
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function NotificationsRoute() {
  useTheme();
  const [params] = useSearchParams();
  const inboxState = (params.get("state") as InboxState) || "expanded";
  const filter = (params.get("filter") as InboxFilter) || "all";
  const density = (params.get("density") as "compact" | "medium") || "medium";
  return <NotificationsScreen inboxState={inboxState} filter={filter} density={density} showBanner={false} />;
}

function BoardRoute() {
  useTheme();
  const [params] = useSearchParams();
  const density = (params.get("density") as "compact" | "medium") || "medium";
  const startCreating = params.get("creating") === "1";
  return <BoardScreen density={density} startCreating={startCreating} />;
}

function InitRoute() {
  useTheme();
  return <InitScreen />;
}

function DrawerRoute() {
  useTheme();
  const [params] = useSearchParams();
  const state = (params.get("state") as DrawerState) || "iter-done";
  return <DrawerStage state={state} />;
}

function QARoute() {
  useTheme();
  const [params] = useSearchParams();
  const variant = (params.get("variant") as QAVariant) || "drawer";
  const autoplay = params.get("autoplay") !== "0";
  return <QAScreen variant={variant} autoplay={autoplay} />;
}

function StatesRoute() {
  useTheme();
  return <StatesGallery />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/board" replace />} />
        <Route path="/notifications" element={<NotificationsRoute />} />
        <Route path="/board" element={<BoardRoute />} />
        <Route path="/init" element={<InitRoute />} />
        <Route path="/drawer" element={<DrawerRoute />} />
        <Route path="/qa" element={<QARoute />} />
        <Route path="/dev/states" element={<StatesRoute />} />
      </Routes>
    </BrowserRouter>
  );
}

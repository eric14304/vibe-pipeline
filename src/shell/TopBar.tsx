import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { BellIcon, CheckIconSm, ChevronIcon, FolderIcon, GearIcon, MoonIcon, PlusIcon, SunIcon } from "../ui/icons";
import * as api from "../api/projects";
import { useActiveProjectHash } from "../hooks/useActiveProject";
import type { Project } from "../../shared/types";

export function TopBar({
  onBellClick,
  notifActive = false,
  unreadCount = 0,
}: {
  onBellClick?: () => void;
  notifActive?: boolean;
  unreadCount?: number;
} = {}) {
  const { hash, setHash } = useActiveProjectHash();
  const [recents, setRecents] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // theme 來源:URL ?theme= override → localStorage → light
  // toggle 寫 localStorage 並同步 <html> class(useTheme hook 也會跑,雙保險;localStorage 觸發不了 React 重 render,所以這裡也手動 setIsDark)
  const [searchParams] = useSearchParams();
  const urlTheme = searchParams.get("theme");
  const [isDark, setIsDark] = useState(() => {
    if (urlTheme === "dark") return true;
    if (urlTheme === "light") return false;
    try {
      return localStorage.getItem("vibe-pipeline:theme") === "dark";
    } catch {
      return false;
    }
  });
  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    try {
      localStorage.setItem("vibe-pipeline:theme", next ? "dark" : "light");
    } catch {}
    document.documentElement.classList.toggle("light", !next);
  }

  useEffect(() => {
    api
      .listRecent()
      .then(setRecents)
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // ⌘O / Ctrl+O 開選資料夾(對應 menu 裡的 kbd hint)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === "o" || e.key === "O")) {
        e.preventDefault();
        pickAndOpen();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // pickAndOpen 用 closure capture state(busy),不放進 deps 避免每 render 重綁
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = recents.find((p) => p.hash === hash) ?? null;

  async function pickAndOpen() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { path } = await api.selectFolder();
      const project = await api.openProject(path);
      const list = await api.listRecent();
      setRecents(list);
      setHash(project.hash);
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const code = (e as { code?: string }).code;
      if (code !== "dialog_cancelled") setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function selectExisting(p: Project) {
    setBusy(true);
    setError(null);
    try {
      const project = await api.openProject(p.path);
      setHash(project.hash);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <Logo size={18} />
          <span>vibe-pipeline</span>
        </div>
        <span className="topbar-sep" />

        <div className="proj-switcher" ref={wrapRef}>
          <button
            className={"proj-trigger" + (open ? " is-open" : "")}
            onClick={() => setOpen((o) => !o)}
            title="切換專案"
          >
            <FolderIcon />
            <span className="proj-trigger-name">{active?.name ?? "選擇專案"}</span>
            <span className="proj-trigger-path mono">{active?.path ?? "(尚未選擇)"}</span>
            <ChevronIcon />
          </button>
          {open && (
            <div className="proj-menu fade-up" role="menu">
              <div className="proj-menu-label mono">最近專案</div>
              {recents.length === 0 && (
                <div className="proj-menu-label mono" style={{ opacity: 0.6 }}>
                  (還沒開過任何專案)
                </div>
              )}
              {recents.map((p) => (
                <button
                  key={p.hash}
                  className={"proj-menu-item" + (p.hash === hash ? " is-active" : "")}
                  onClick={() => selectExisting(p)}
                  disabled={busy}
                >
                  <FolderIcon />
                  <div className="proj-menu-item-text">
                    <div className="proj-menu-item-name">{p.name}</div>
                    <div className="proj-menu-item-path mono">{p.path}</div>
                  </div>
                  <span className="proj-menu-item-meta mono">
                    {p.hasInit ? "已初始化" : "未初始化"}
                  </span>
                  {p.hash === hash && (
                    <span className="proj-menu-check">
                      <CheckIconSm />
                    </span>
                  )}
                </button>
              ))}
              <div className="proj-menu-divider" />
              <button
                className="proj-menu-item proj-menu-item-action"
                onClick={pickAndOpen}
                disabled={busy}
              >
                <PlusIcon />
                <span>{busy ? "開啟中…" : "選擇其他資料夾…"}</span>
                <span className="kbd mono" style={{ marginLeft: "auto" }}>
                  {isMac() ? "⌘O" : "Ctrl+O"}
                </span>
              </button>
              {error && (
                <div
                  className="proj-menu-label mono"
                  style={{ color: "var(--accent)", padding: "8px 12px" }}
                >
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {active && (
          <>
            {active.hasGit && (
              <span
                className="chip mono"
                title={active.currentBranch ? `當前 branch: ${active.currentBranch}` : "detached HEAD"}
              >
                <span style={{ color: "var(--fg-mute)" }}>⎇</span>{" "}
                {active.currentBranch ?? "(detached)"}
              </span>
            )}
            <button
              className="chip"
              title="在檔案總管中開啟"
              onClick={() => api.reveal(active.hash).catch(() => {})}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <FolderIcon />
              <span>開啟專案資料夾</span>
            </button>
          </>
        )}
      </div>

      <span style={{ flex: 1 }} />

      <div className="topbar-right">
        <button
          className="icon-btn topbar-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "切到亮色" : "切到暗色"}
          aria-label={isDark ? "切到亮色主題" : "切到暗色主題"}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          className={"icon-btn" + (notifActive ? " is-active" : "")}
          title={unreadCount > 0 ? `${unreadCount} 則未讀通知` : "通知"}
          onClick={onBellClick}
          aria-label={unreadCount > 0 ? `通知 (${unreadCount} 未讀)` : "通知"}
        >
          <BellIcon />
          {unreadCount > 0 && (
            <span className="bell-dot bell-dot-num" aria-hidden="true">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
        <button className="icon-btn" title="設定 (尚未實作)" disabled>
          <GearIcon />
        </button>
      </div>
    </div>
  );
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // 用 userAgentData (新版瀏覽器) 或 fallback 到 platform/userAgent
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(ua);
}

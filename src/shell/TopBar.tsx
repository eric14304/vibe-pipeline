import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Logo } from "../ui/Logo";
import { CheckIconSm, ChevronIcon, FolderIcon, MoonIcon, PlusIcon, SunIcon } from "../ui/icons";
import * as api from "../api/projects";
import { useActiveProjectHash } from "../hooks/useActiveProject";
import type { Project } from "../../shared/types";

export function TopBar({
  runningCount = 0,
  maxParallel = 0,
  settingsSlot,
}: {
  runningCount?: number;
  maxParallel?: number;
  // shell 是版型容器,settings 屬於 features/ → 由外部(BoardScreen)注入,
  // TopBar 自己不認識 features/settings,維持 shell↛features 的 layering
  settingsSlot?: ReactNode;
} = {}) {
  const { hash, setHash } = useActiveProjectHash();
  const [recents, setRecents] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!overflowOpen) return;
    function onClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverflowOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [overflowOpen]);

  // ⌘O / Ctrl+O 開選資料夾(對應 menu 裡的 kbd hint)
  // pickAndOpen 用 closure capture state(busy),不放進 deps 避免每 render 重綁
  // biome-ignore lint/correctness/useExhaustiveDependencies: pickAndOpen 不放 deps 避免每 render 重綁聽器
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
          <button type="button"
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
                <button type="button"
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
              <button type="button"
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
          <div className="topbar-active-meta">
            {active.hasGit && (
              <span
                className="chip mono"
                title={active.currentBranch ? `當前 branch: ${active.currentBranch}` : "detached HEAD"}
              >
                <span style={{ color: "var(--fg-mute)" }}>⎇</span>{" "}
                {active.currentBranch ?? "(detached)"}
              </span>
            )}
            <button type="button"
              className="chip"
              title="在檔案總管中開啟"
              onClick={() => api.reveal(active.hash).catch(() => {})}
              style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <FolderIcon />
              <span>開啟專案資料夾</span>
            </button>
          </div>
        )}
      </div>

      <span className="topbar-spacer" />

      <div className="topbar-right">
        <div className="topbar-overflow" ref={overflowRef}>
          <button
            type="button"
            className={"icon-btn topbar-overflow-toggle" + (overflowOpen ? " is-open" : "")}
            onClick={() => setOverflowOpen((o) => !o)}
            title="更多操作"
            aria-label="更多操作"
            aria-expanded={overflowOpen}
          >
            ⋯
          </button>
          <div className={"topbar-overflow-menu" + (overflowOpen ? " is-open" : "")}>
            {active && (
              <div className="topbar-overflow-mobile-items">
                {active.hasGit && (
                  <span
                    className="chip mono topbar-overflow-chip"
                    title={active.currentBranch ? `當前 branch: ${active.currentBranch}` : "detached HEAD"}
                  >
                    <span style={{ color: "var(--fg-mute)" }}>⎇</span>{" "}
                    {active.currentBranch ?? "(detached)"}
                  </span>
                )}
                <button
                  type="button"
                  className="topbar-overflow-item"
                  title="在檔案總管中開啟"
                  onClick={() => {
                    setOverflowOpen(false);
                    api.reveal(active.hash).catch(() => {});
                  }}
                >
                  <FolderIcon />
                  <span>開啟專案資料夾</span>
                </button>
              </div>
            )}
            {hash && maxParallel > 0 && (
              <ParallelChip running={runningCount} max={maxParallel} />
            )}
            <button type="button"
              className="icon-btn topbar-theme-toggle"
              onClick={toggleTheme}
              title={isDark ? "切到亮色" : "切到暗色"}
              aria-label={isDark ? "切到亮色主題" : "切到暗色主題"}
            >
              {isDark ? <SunIcon /> : <MoonIcon />}
            </button>
            {settingsSlot}
          </div>
        </div>
      </div>
    </div>
  );
}

// N/M chip:過載(N>M,max_parallel 改小但已起的不 kill)時加括號標記
function ParallelChip({ running, max }: { running: number; max: number }) {
  const overload = running > max;
  const color = overload
    ? "var(--failed)"
    : running >= max && running > 0
    ? "var(--queued)"
    : running > 0
    ? "var(--running)"
    : "var(--fg-mute)";
  return (
    <span
      className="chip mono"
      title={
        overload
          ? `running ${running} 條已超過 max_parallel ${max}(改小不會 kill 既有的)`
          : `同時跑 ${running} / ${max} 條`
      }
      style={{ color, borderColor: "var(--line)" }}
    >
      <span style={{ color: "var(--fg-mute)" }}>▶</span>
      {running}/{max}
      {overload && <span style={{ color: "var(--failed)" }}>!</span>}
    </span>
  );
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  // 用 userAgentData (新版瀏覽器) 或 fallback 到 platform/userAgent
  const ua = navigator.userAgent || "";
  return /Mac|iPhone|iPad|iPod/i.test(ua);
}

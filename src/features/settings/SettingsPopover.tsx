import { useEffect, useRef, useState } from "react";
import * as api from "../../api/projects";

const MIN = 1;
const MAX = 8;

// Project-level Settings popover。目前只露 max_parallel(同時可跑幾條 pipeline)。
// 其他設定(merge_strategy / cost 上限等)未來再加。
export function SettingsPopover({
  hash,
  open,
  onClose,
  onSaved,
  anchorRef,
}: {
  hash: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (cfg: api.ProjectConfig) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const [cfg, setCfg] = useState<api.ProjectConfig | null>(null);
  const [draft, setDraft] = useState<number>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    api
      .getConfig(hash)
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        setDraft(c.defaults.max_parallel);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [hash, open]);

  // outside click + Esc 關
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const clamped = Math.max(MIN, Math.min(MAX, Math.floor(draft || MIN)));
  const dirty = cfg ? clamped !== cfg.defaults.max_parallel : false;

  async function save() {
    if (!dirty) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.updateConfig(hash, {
        defaults: { max_parallel: clamped },
      });
      setCfg(next);
      setDraft(next.defaults.max_parallel);
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-label="設定"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        minWidth: 320,
        background: "var(--bg-elevated)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        boxShadow: "var(--shadow-lg)",
        padding: 14,
        zIndex: 1500,
        fontSize: 13,
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.06em",
          color: "var(--fg-mute)",
          textTransform: "uppercase",
          marginBottom: 10,
        }}
      >
        Project 設定
      </div>

      <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>
        同時可跑 pipeline 數
      </label>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 6,
        }}
      >
        <input
          type="number"
          min={MIN}
          max={MAX}
          step={1}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          disabled={busy}
          className="mono"
          style={{
            width: 64,
            padding: "4px 8px",
            border: "1px solid var(--line)",
            borderRadius: 4,
            background: "var(--panel)",
            color: "var(--fg)",
            fontSize: 13,
          }}
        />
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          範圍 {MIN}–{MAX}
        </span>
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--fg-faint)",
          lineHeight: 1.5,
          marginBottom: 12,
        }}
      >
        達到上限後新 Run 會排隊,前面跑完自動接棒。每條走獨立 worktree。
      </div>

      {error && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--failed)",
            marginBottom: 8,
            wordBreak: "break-word",
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn"
          onClick={onClose}
          disabled={busy}
        >
          關閉
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={!dirty || busy}
          title={!dirty ? "尚未變更" : `儲存 max_parallel=${clamped}`}
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

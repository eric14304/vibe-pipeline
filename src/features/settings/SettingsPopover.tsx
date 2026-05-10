import { useEffect, useRef, useState } from "react";
import * as api from "../../api/projects";
import * as userConfigApi from "../../api/userConfig";
import {
  EFFORT_LEVELS,
  MODEL_NAMES,
  TASK_CLASSES,
  TASK_CLASS_LABELS,
  type Effort,
  type ModelName,
  type TaskClass,
  type UserConfig,
} from "../../../shared/types";

const MIN = 1;
const MAX = 8;

function TaskModelPicker({
  label,
  model,
  effort,
  disabled,
  onChange,
}: {
  label: string;
  model: ModelName;
  effort: Effort;
  disabled?: boolean;
  onChange: (patch: { model?: ModelName; effort?: Effort }) => void;
}) {
  const selectStyle: React.CSSProperties = {
    padding: "3px 6px",
    border: "1px solid var(--line)",
    borderRadius: 4,
    background: "var(--panel)",
    color: "var(--fg)",
    fontSize: 12,
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12,
      }}
    >
      <span style={{ flex: 1, color: "var(--fg)" }}>{label}</span>
      <select
        className="mono"
        value={model}
        disabled={disabled}
        onChange={(e) => onChange({ model: e.target.value as ModelName })}
        style={selectStyle}
      >
        {MODEL_NAMES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="mono"
        value={effort}
        disabled={disabled}
        onChange={(e) => onChange({ effort: e.target.value as Effort })}
        style={selectStyle}
      >
        {EFFORT_LEVELS.map((eff) => (
          <option key={eff} value={eff}>
            {eff}
          </option>
        ))}
      </select>
    </div>
  );
}

// Project-level Settings popover。露 max_parallel / default_base_branch / cost_limit_usd。
// (merge_strategy 已鎖 'merge',不再露,因為 squash/ff-only 跟 auto-rebase + sync chip 不相容)
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
  const [draftMaxParallel, setDraftMaxParallel] = useState<number>(2);
  const [draftBaseBranch, setDraftBaseBranch] = useState<string>("");
  const [draftCostLimit, setDraftCostLimit] = useState<string>("0");
  const [draftAutoMerge, setDraftAutoMerge] = useState<boolean>(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // User-level config(跨 project)— 跟上面的 project-level 是不同層,獨立 PUT
  const [userCfg, setUserCfg] = useState<UserConfig | null>(null);
  const [userCfgError, setUserCfgError] = useState<string | null>(null);
  const [userCfgBusy, setUserCfgBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    api
      .getConfig(hash)
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        setDraftMaxParallel(c.defaults.max_parallel);
        setDraftBaseBranch(c.defaults.base_branch ?? "");
        setDraftCostLimit(String(c.defaults.cost_limit_usd ?? 0));
        setDraftAutoMerge(!!c.defaults.auto_merge);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [hash, open]);

  // User-level config 載入
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUserCfgError(null);
    userConfigApi
      .getUserConfig()
      .then((c) => {
        if (!cancelled) setUserCfg(c);
      })
      .catch((e: Error) => {
        if (!cancelled) setUserCfgError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function updateTask(tc: TaskClass, patch: { model?: ModelName; effort?: Effort }) {
    if (!userCfg) return;
    const cur = userCfg.defaults[tc];
    const next: UserConfig = {
      ...userCfg,
      defaults: {
        ...userCfg.defaults,
        [tc]: { ...cur, ...patch },
      },
    };
    // 樂觀 UI:先 set,失敗 rollback
    setUserCfg(next);
    setUserCfgBusy(true);
    setUserCfgError(null);
    try {
      const saved = await userConfigApi.updateUserConfig({
        defaults: { [tc]: patch },
      });
      setUserCfg(saved);
    } catch (e) {
      setUserCfgError(e instanceof Error ? e.message : String(e));
      setUserCfg(userCfg); // rollback
    } finally {
      setUserCfgBusy(false);
    }
  }

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

  const clampedMaxParallel = Math.max(MIN, Math.min(MAX, Math.floor(draftMaxParallel || MIN)));
  const trimmedBase = draftBaseBranch.trim();
  const parsedCost = Number(draftCostLimit);
  const costValid = Number.isFinite(parsedCost) && parsedCost >= 0;
  const baseValid = trimmedBase.length > 0;

  const dirty = cfg
    ? clampedMaxParallel !== cfg.defaults.max_parallel ||
      trimmedBase !== (cfg.defaults.base_branch ?? "") ||
      parsedCost !== cfg.defaults.cost_limit_usd ||
      draftAutoMerge !== !!cfg.defaults.auto_merge
    : false;
  const canSave = dirty && baseValid && costValid;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.updateConfig(hash, {
        defaults: {
          max_parallel: clampedMaxParallel,
          default_base_branch: trimmedBase,
          cost_limit_usd: parsedCost,
          auto_merge: draftAutoMerge,
        },
      });
      setCfg(next);
      setDraftMaxParallel(next.defaults.max_parallel);
      setDraftBaseBranch(next.defaults.base_branch ?? "");
      setDraftCostLimit(String(next.defaults.cost_limit_usd ?? 0));
      setDraftAutoMerge(!!next.defaults.auto_merge);
      onSaved?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: "4px 8px",
    border: "1px solid var(--line)",
    borderRadius: 4,
    background: "var(--panel)",
    color: "var(--fg)",
    fontSize: 13,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    marginBottom: 4,
    fontWeight: 500,
  };

  const hintStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--fg-faint)",
    lineHeight: 1.5,
    marginBottom: 12,
  };

  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-label="設定"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        minWidth: 340,
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

      <label style={labelStyle}>同時可跑 pipeline 數</label>
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
          value={draftMaxParallel}
          onChange={(e) => setDraftMaxParallel(Number(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
          }}
          disabled={busy}
          className="mono"
          style={{ ...inputStyle, width: 64 }}
        />
        <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>
          範圍 {MIN}–{MAX}
        </span>
      </div>
      <div style={hintStyle}>
        達到上限後新 Run 會排隊,前面跑完自動接棒。每條走獨立 worktree。
      </div>

      <label style={labelStyle}>預設 base branch</label>
      <input
        type="text"
        value={draftBaseBranch}
        onChange={(e) => setDraftBaseBranch(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        disabled={busy}
        placeholder={cfg?.defaults.base_branch || "main"}
        className="mono"
        style={{ ...inputStyle, width: "100%", marginBottom: 6, boxSizing: "border-box" }}
      />
      <div style={hintStyle}>
        新 pipeline 預設從這個 branch 切;merge 也回到這裡。空白不可送。
      </div>

      <label style={labelStyle}>Cost 上限 (USD)</label>
      <input
        type="number"
        min={0}
        step={0.01}
        value={draftCostLimit}
        onChange={(e) => setDraftCostLimit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        disabled={busy}
        placeholder="0 = 無限"
        className="mono"
        style={{ ...inputStyle, width: 120, marginBottom: 6 }}
      />
      <div style={hintStyle}>0 = 無限。超過上限會擋下新的 /run 並發 notif。</div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={draftAutoMerge}
          onChange={(e) => setDraftAutoMerge(e.target.checked)}
          disabled={busy}
        />
        <span style={{ fontWeight: 500 }}>新 pipeline 預設啟用「自動合併」</span>
      </label>
      <div style={hintStyle}>
        全 ticket done 進 ready 後,backend 自動 append merge ticket 走既有 runner 流程,不用人按。
        失敗(working tree 髒 / merge ticket FAIL)走原本錯誤路徑,不重試。每條 pipeline 也可單獨切換。
      </div>

      <div
        style={{
          marginTop: 6,
          marginBottom: 10,
          fontSize: 12,
          letterSpacing: "0.06em",
          color: "var(--fg-mute)",
          textTransform: "uppercase",
        }}
      >
        AI 任務 model / effort(跨 project)
      </div>
      {userCfg ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
          {TASK_CLASSES.map((tc) => (
            <TaskModelPicker
              key={tc}
              label={TASK_CLASS_LABELS[tc]}
              model={userCfg.defaults[tc].model}
              effort={userCfg.defaults[tc].effort}
              disabled={userCfgBusy}
              onChange={(patch) => updateTask(tc, patch)}
            />
          ))}
        </div>
      ) : (
        <div style={hintStyle}>載入中…</div>
      )}
      {userCfgError && (
        <div
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--failed)",
            marginBottom: 8,
            wordBreak: "break-word",
          }}
        >
          {userCfgError}
        </div>
      )}

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
        <button type="button" className="btn" onClick={onClose} disabled={busy}>
          關閉
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={!canSave || busy}
          title={
            !dirty
              ? "尚未變更"
              : !baseValid
              ? "base branch 不可空白"
              : !costValid
              ? "cost 上限需 >= 0"
              : "儲存"
          }
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </div>
  );
}

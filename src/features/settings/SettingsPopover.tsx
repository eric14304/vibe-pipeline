import { useEffect, useRef, useState } from "react";
import * as api from "../../api/projects";
import * as userConfigApi from "../../api/userConfig";
import {
  PROVIDERS,
  TASK_CLASSES,
  TASK_CLASS_HINTS,
  TASK_CLASS_LABELS,
  defaultEffortForProvider,
  defaultModelForProvider,
  effortsForProvider,
  isValidEffort,
  isValidModel,
  modelsForProvider,
  type Effort,
  type ModelName,
  type Provider,
  type TaskClass,
  type UserConfig,
} from "../../../shared/types";

const MIN = 1;
const MAX = 8;

const TASK_SELECT_STYLE: React.CSSProperties = {
  padding: "3px 4px",
  border: "1px solid var(--line)",
  borderRadius: 4,
  background: "var(--panel)",
  color: "var(--fg)",
  fontSize: 11.5,
  fontFamily: "var(--font-mono)",
};

function TaskModelRow({
  label,
  hint,
  provider,
  model,
  effort,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  provider: Provider;
  model: ModelName;
  effort: Effort;
  disabled?: boolean;
  onChange: (patch: { provider?: Provider; model?: ModelName; effort?: Effort }) => void;
}) {
  return (
    <>
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          alignSelf: "center",
          whiteSpace: "nowrap",
          lineHeight: 1.25,
        }}
      >
        <span style={{ fontSize: 12, color: "var(--fg)" }}>{label}</span>
        {hint && (
          <span style={{ fontSize: 10.5, color: "var(--fg-faint)", marginTop: 1 }}>{hint}</span>
        )}
      </span>
      <select
        value={provider}
        disabled={disabled}
        onChange={(e) => onChange({ provider: e.target.value as Provider })}
        style={TASK_SELECT_STYLE}
      >
        {PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
      <select
        value={model}
        disabled={disabled}
        onChange={(e) => onChange({ model: e.target.value as ModelName })}
        style={TASK_SELECT_STYLE}
      >
        {modelsForProvider(provider).map((m) => (
          <option key={m} value={m}>
            {m.replace(/^claude-/, "")}
          </option>
        ))}
      </select>
      <select
        value={effort}
        disabled={disabled}
        onChange={(e) => onChange({ effort: e.target.value as Effort })}
        style={TASK_SELECT_STYLE}
      >
        {effortsForProvider(provider).map((eff) => (
          <option key={eff} value={eff}>
            {eff}
          </option>
        ))}
      </select>
    </>
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

  async function updateTask(
    tc: TaskClass,
    patch: { provider?: Provider; model?: ModelName; effort?: Effort }
  ) {
    if (!userCfg) return;
    const cur = userCfg.defaults[tc];
    // provider 變但 patch 沒帶 model / effort → 自動 snap 到該 provider 預設,避免送出非法組合
    const merged = { ...cur, ...patch };
    if (patch.provider && patch.provider !== cur.provider) {
      const np = patch.provider;
      if (patch.model === undefined && !isValidModel(np, merged.model)) {
        merged.model = defaultModelForProvider(np);
        patch = { ...patch, model: merged.model };
      }
      if (patch.effort === undefined && !isValidEffort(np, merged.effort)) {
        merged.effort = defaultEffortForProvider(np);
        patch = { ...patch, effort: merged.effort };
      }
    }
    const next: UserConfig = {
      ...userCfg,
      defaults: {
        ...userCfg.defaults,
        [tc]: merged,
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

  const sectionHeaderStyle: React.CSSProperties = {
    fontSize: 10.5,
    letterSpacing: "0.08em",
    color: "var(--fg-mute)",
    textTransform: "uppercase",
    fontWeight: 600,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: "1px solid var(--line)",
  };

  const fieldRowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "112px 1fr",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  };

  const subhintStyle: React.CSSProperties = {
    fontSize: 10.5,
    color: "var(--fg-faint)",
    lineHeight: 1.5,
    marginLeft: 122,
    marginBottom: 10,
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
        width: "fit-content",
        minWidth: 420,
        maxWidth: "min(560px, calc(100vw - 32px))",
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
        background: "var(--bg-elevated)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        boxShadow: "var(--shadow-lg)",
        padding: "14px 16px 12px",
        zIndex: 1500,
        fontSize: 13,
      }}
    >
      {/* ─── Project 設定 ─── */}
      <div style={sectionHeaderStyle}>Project 設定</div>

      <div style={fieldRowStyle}>
        <label style={labelStyle}>平行上限</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            {MIN}–{MAX} 條
          </span>
        </div>
      </div>
      <div style={subhintStyle}>達到上限後新 Run 排隊,前面跑完自動接棒。</div>

      <div style={fieldRowStyle}>
        <label style={labelStyle}>Base branch</label>
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
          style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
        />
      </div>
      <div style={subhintStyle}>新 pipeline 預設從這個 branch 切。</div>

      <div style={fieldRowStyle}>
        <label style={labelStyle}>Cost 上限</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
            placeholder="0"
            className="mono"
            style={{ ...inputStyle, width: 100 }}
          />
          <span className="mono" style={{ fontSize: 11, color: "var(--fg-faint)" }}>USD,0 = 無限</span>
        </div>
      </div>
      <div style={subhintStyle}>超過上限會擋下新 /run 並發 notif。</div>

      <div style={{ ...fieldRowStyle, marginBottom: 4 }}>
        <span style={labelStyle}>自動合併</span>
        <label
          className={"toggle-pill mono" + (draftAutoMerge ? " is-on" : "")}
          title="全 ticket done → backend 自動 append merge ticket 走 runner 流程"
          style={{ alignSelf: "start" }}
        >
          <input
            type="checkbox"
            checked={draftAutoMerge}
            onChange={(e) => setDraftAutoMerge(e.target.checked)}
            disabled={busy}
          />
          <span className="toggle-pill-track" aria-hidden>
            <span className="toggle-pill-thumb" />
          </span>
          新 pipeline 預設啟用
        </label>
      </div>
      <div style={subhintStyle}>每條 pipeline 也可單獨切換。</div>

      {/* ─── AI 任務(跨 project) ─── */}
      <div style={{ ...sectionHeaderStyle, marginTop: 6 }}>
        AI 任務
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            color: "var(--fg-faint)",
            textTransform: "none",
            letterSpacing: 0,
            fontWeight: 400,
          }}
        >
          跨 project — provider / model / reasoning
        </span>
      </div>
      {userCfg ? (
        <div
          style={{
            display: "grid",
            // 第一欄 auto 撐到最長 label;model 欄要容 codex 較長名稱,給 max-content
            gridTemplateColumns: "auto max-content max-content max-content",
            columnGap: 8,
            rowGap: 8,
            marginBottom: 12,
            alignItems: "center",
          }}
        >
          {TASK_CLASSES.map((tc) => (
            <TaskModelRow
              key={tc}
              label={TASK_CLASS_LABELS[tc]}
              hint={TASK_CLASS_HINTS[tc]}
              provider={userCfg.defaults[tc].provider}
              model={userCfg.defaults[tc].model}
              effort={userCfg.defaults[tc].effort}
              disabled={userCfgBusy}
              onChange={(patch) => updateTask(tc, patch)}
            />
          ))}
        </div>
      ) : (
        <div style={subhintStyle}>載入中…</div>
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

      <div
        style={{
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          paddingTop: 10,
          borderTop: "1px solid var(--line)",
        }}
      >
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

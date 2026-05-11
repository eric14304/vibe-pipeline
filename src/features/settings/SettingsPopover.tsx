import { useEffect, useRef, useState } from "react";
import * as api from "../../api/projects";
import * as userConfigApi from "../../api/userConfig";
import { SecurityTab } from "../auth/SecurityTab";
import { useAuthStatus } from "../auth/useAuthStatus";
import {
  getPermission,
  getStoredToken,
  isFcmSupported,
  requestAndRegisterToken,
  unregisterToken as unregisterFcm,
} from "../../lib/fcm";
import "./SettingsPopover.css";
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
const AUTOSAVE_DELAY_MS = 400;
const SAVED_VISIBLE_MS = 3000;

type TaskModelPatch = { provider?: Provider; model?: ModelName; effort?: Effort };
type ProjectField = "max_parallel" | "default_base_branch" | "cost_limit_usd" | "auto_merge";
type TaskField = "provider" | "model" | "effort";
type AutosaveKey = `project:${ProjectField}` | `task:${TaskClass}:${TaskField}`;
type ProjectConfirmedValues = {
  max_parallel: number;
  default_base_branch: string;
  cost_limit_usd: string;
  auto_merge: boolean;
};
type TaskConfirmedValue = Provider | ModelName | Effort;
type TaskConfirmedValues = Partial<Record<`task:${TaskClass}:${TaskField}`, TaskConfirmedValue>>;

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

function PushNotificationsSection({
  onActionError,
}: {
  onActionError?: (message: string) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(getPermission());
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void isFcmSupported().then((ok) => {
      if (!cancelled) setSupported(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function refreshPermission() {
    setPermission(getPermission());
    setToken(getStoredToken());
  }

  async function enable() {
    setLoading(true);
    try {
      await requestAndRegisterToken();
      refreshPermission();
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "啟用通知失敗";
      onActionError?.(message);
      refreshPermission();
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    try {
      await unregisterFcm();
      refreshPermission();
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "停用通知失敗";
      onActionError?.(message);
    } finally {
      setLoading(false);
    }
  }

  const sectionHeader: React.CSSProperties = {
    fontSize: 10.5,
    letterSpacing: "0.08em",
    color: "var(--fg-mute)",
    textTransform: "uppercase",
    fontWeight: 600,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: "1px solid var(--line)",
    marginTop: 6,
  };
  const hint: React.CSSProperties = {
    fontSize: 11,
    color: "var(--fg-faint)",
    lineHeight: 1.5,
    marginBottom: 8,
  };
  const statusRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    fontSize: 12.5,
  };

  let statusIcon = "○";
  let statusText = "尚未啟用";
  let statusColor: string = "var(--fg-faint)";
  if (supported === false) {
    statusIcon = "✕";
    statusText = "瀏覽器不支援推播";
    statusColor = "var(--fg-faint)";
  } else if (permission === "denied") {
    statusIcon = "✕";
    statusText = "權限已封鎖";
    statusColor = "var(--failed)";
  } else if (permission === "granted" && token) {
    statusIcon = "●";
    statusText = "已啟用";
    statusColor = "var(--done)";
  } else if (permission === "granted") {
    statusIcon = "○";
    statusText = "已授權,尚未註冊";
    statusColor = "var(--fg-mute)";
  }

  return (
    <div>
      <div style={sectionHeader}>Push 通知</div>
      <div style={statusRow}>
        <span style={{ color: statusColor, fontFamily: "var(--font-mono)" }}>{statusIcon}</span>
        <span style={{ color: "var(--fg)" }}>{statusText}</span>
      </div>
      {supported === false ? (
        <div style={hint}>此瀏覽器不支援 Web Push,改用桌面通知或行動 App。</div>
      ) : permission === "denied" ? (
        <div style={hint}>已封鎖,請到瀏覽器網址列設定中重新允許後再回到此頁啟用。</div>
      ) : token ? (
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={loading}
            onClick={() => void disable()}
          >
            {loading ? "處理中…" : "停用通知"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <button
            type="button"
            className="btn"
            disabled={loading || supported === null}
            onClick={() => void enable()}
          >
            {loading ? "處理中…" : "啟用通知"}
          </button>
        </div>
      )}
      <div style={hint}>啟用後 pipeline 完成 / 失敗會推到此裝置(背景或前景皆可)。</div>
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
  onActionError,
  anchorRef,
}: {
  hash: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (cfg: api.ProjectConfig) => void;
  onActionError?: (message: string) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  const [cfg, setCfg] = useState<api.ProjectConfig | null>(null);
  const [draftMaxParallel, setDraftMaxParallel] = useState<number>(2);
  const [draftBaseBranch, setDraftBaseBranch] = useState<string>("");
  const [draftCostLimit, setDraftCostLimit] = useState<string>("0");
  const [draftAutoMerge, setDraftAutoMerge] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVisible, setSavedVisible] = useState(false);
  const [savedFading, setSavedFading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<Partial<Record<AutosaveKey, ReturnType<typeof setTimeout>>>>({});
  const controllersRef = useRef<Partial<Record<AutosaveKey, AbortController>>>({});
  const seqRef = useRef<Partial<Record<AutosaveKey, number>>>({});
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedProjectCfgRef = useRef<api.ProjectConfig | null>(null);
  const savedUserCfgRef = useRef<UserConfig | null>(null);
  const confirmedProjectValuesRef = useRef<ProjectConfirmedValues | null>(null);
  const confirmedTaskValuesRef = useRef<TaskConfirmedValues>({});
  // User-level config(跨 project)— 跟上面的 project-level 是不同層,獨立 PUT
  const [userCfg, setUserCfg] = useState<UserConfig | null>(null);
  const [userCfgError, setUserCfgError] = useState<string | null>(null);
  const { status: authStatus } = useAuthStatus();
  // tab 切換 — 取代之前 stacked sections,避免 popover 越來越長
  type TabKey = "project" | "ai" | "notifications" | "security";
  const [activeTab, setActiveTab] = useState<TabKey>("project");

  function isAbortError(e: unknown): boolean {
    return e instanceof Error && e.name === "AbortError";
  }

  function toastSaveError(e: unknown) {
    if (isAbortError(e)) return;
    const message = e instanceof Error && e.message ? e.message : "儲存失敗，請重試";
    onActionError?.(message);
  }

  function showSaved() {
    setSavedVisible(true);
    setSavedFading(false);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setSavedFading(true), SAVED_VISIBLE_MS);
  }

  function onSavedTransitionEnd(e: React.TransitionEvent<HTMLSpanElement>) {
    if (e.propertyName !== "opacity" || !savedFading) return;
    setSavedVisible(false);
    setSavedFading(false);
  }

  function setConfirmedProjectValues(c: api.ProjectConfig) {
    confirmedProjectValuesRef.current = {
      max_parallel: c.defaults.max_parallel,
      default_base_branch: c.defaults.base_branch ?? "",
      cost_limit_usd: String(c.defaults.cost_limit_usd ?? 0),
      auto_merge: !!c.defaults.auto_merge,
    };
  }

  function updateConfirmedProjectValue(field: ProjectField, c: api.ProjectConfig) {
    const current =
      confirmedProjectValuesRef.current ?? {
        max_parallel: c.defaults.max_parallel,
        default_base_branch: c.defaults.base_branch ?? "",
        cost_limit_usd: String(c.defaults.cost_limit_usd ?? 0),
        auto_merge: !!c.defaults.auto_merge,
      };
    confirmedProjectValuesRef.current = {
      ...current,
      [field]:
        field === "max_parallel"
          ? c.defaults.max_parallel
          : field === "default_base_branch"
            ? (c.defaults.base_branch ?? "")
            : field === "cost_limit_usd"
              ? String(c.defaults.cost_limit_usd ?? 0)
              : !!c.defaults.auto_merge,
    };
  }

  function setConfirmedTaskValues(c: UserConfig) {
    const next: TaskConfirmedValues = {};
    for (const tc of TASK_CLASSES) {
      next[`task:${tc}:provider`] = c.defaults[tc].provider;
      next[`task:${tc}:model`] = c.defaults[tc].model;
      next[`task:${tc}:effort`] = c.defaults[tc].effort;
    }
    confirmedTaskValuesRef.current = next;
  }

  function applyConfirmedTaskValue(
    task: UserConfig["defaults"][TaskClass],
    field: TaskField,
    value: TaskConfirmedValue
  ): UserConfig["defaults"][TaskClass] {
    if (field === "provider") return { ...task, provider: value as Provider };
    if (field === "model") return { ...task, model: value as ModelName };
    return { ...task, effort: value as Effort };
  }

  function scheduleAutosave(
    key: AutosaveKey,
    run: (signal: AbortSignal, seq: number) => Promise<void>,
    rollback: (e: unknown) => void
  ) {
    const seq = (seqRef.current[key] ?? 0) + 1;
    seqRef.current[key] = seq;
    const existingTimer = timersRef.current[key];
    if (existingTimer) clearTimeout(existingTimer);
    timersRef.current[key] = setTimeout(() => {
      controllersRef.current[key]?.abort();
      const controller = new AbortController();
      controllersRef.current[key] = controller;
      run(controller.signal, seq)
        .catch((e: unknown) => {
          if (seqRef.current[key] !== seq || isAbortError(e)) return;
          rollback(e);
        })
        .finally(() => {
          if (controllersRef.current[key] === controller) delete controllersRef.current[key];
        });
    }, AUTOSAVE_DELAY_MS);
  }

  function mergeProjectSaved(field: ProjectField, next: api.ProjectConfig): api.ProjectConfig {
    const base = savedProjectCfgRef.current ?? next;
    const defaults = { ...base.defaults };
    if (field === "max_parallel") defaults.max_parallel = next.defaults.max_parallel;
    if (field === "default_base_branch") defaults.base_branch = next.defaults.base_branch;
    if (field === "cost_limit_usd") defaults.cost_limit_usd = next.defaults.cost_limit_usd;
    if (field === "auto_merge") defaults.auto_merge = next.defaults.auto_merge;
    return { defaults };
  }

  function applyProjectDisplay(field: ProjectField, next: api.ProjectConfig) {
    if (field === "max_parallel") setDraftMaxParallel(next.defaults.max_parallel);
    if (field === "default_base_branch") setDraftBaseBranch(next.defaults.base_branch ?? "");
    if (field === "cost_limit_usd") setDraftCostLimit(String(next.defaults.cost_limit_usd ?? 0));
    if (field === "auto_merge") setDraftAutoMerge(!!next.defaults.auto_merge);
  }

  function scheduleProjectSave(
    field: ProjectField,
    patch: api.ProjectConfigPatch,
    applyDisplay: (next: api.ProjectConfig) => void,
    rollback: () => void
  ) {
    const key: AutosaveKey = `project:${field}`;
    scheduleAutosave(
      key,
      async (signal, seq) => {
        const next = await api.updateConfig(hash, patch, signal);
        if (seqRef.current[key] !== seq) return;
        const merged = mergeProjectSaved(field, next);
        savedProjectCfgRef.current = merged;
        updateConfirmedProjectValue(field, next);
        setCfg(merged);
        applyDisplay(next);
        onSaved?.(merged);
        showSaved();
      },
      (e) => {
        toastSaveError(e);
        rollback();
      }
    );
  }

  function scheduleTaskSave(
    tc: TaskClass,
    field: TaskField,
    patch: TaskModelPatch,
    desiredTask: UserConfig["defaults"][TaskClass],
    rollback: () => void
  ) {
    const key: AutosaveKey = `task:${tc}:${field}`;
    scheduleAutosave(
      key,
      async (signal, seq) => {
        await userConfigApi.updateUserConfig({ defaults: { [tc]: patch } }, signal);
        if (seqRef.current[key] !== seq) return;
        const current = savedUserCfgRef.current;
        if (current) {
          savedUserCfgRef.current = {
            ...current,
            defaults: {
              ...current.defaults,
              [tc]: { ...current.defaults[tc], ...desiredTask },
            },
          };
        }
        for (const patchedField of Object.keys(patch) as TaskField[]) {
          confirmedTaskValuesRef.current[`task:${tc}:${patchedField}`] = desiredTask[patchedField];
        }
        showSaved();
      },
      (e) => {
        toastSaveError(e);
        rollback();
      }
    );
  }

  useEffect(() => {
    return () => {
      for (const timer of Object.values(timersRef.current)) {
        if (timer) clearTimeout(timer);
      }
      for (const controller of Object.values(controllersRef.current)) {
        controller?.abort();
      }
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    api
      .getConfig(hash)
      .then((c) => {
        if (cancelled) return;
        setCfg(c);
        savedProjectCfgRef.current = c;
        setConfirmedProjectValues(c);
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
        if (cancelled) return;
        savedUserCfgRef.current = c;
        setConfirmedTaskValues(c);
        setUserCfg(c);
      })
      .catch((e: Error) => {
        if (!cancelled) setUserCfgError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  function updateTask(tc: TaskClass, patch: TaskModelPatch) {
    if (!userCfg) return;
    const cur = userCfg.defaults[tc];
    const field: TaskField =
      patch.provider !== undefined ? "provider" : patch.model !== undefined ? "model" : "effort";
    let sendPatch = patch;
    const merged = { ...cur, ...patch };
    if (patch.provider && patch.provider !== cur.provider) {
      const np = patch.provider;
      if (patch.model === undefined && !isValidModel(np, merged.model)) {
        merged.model = defaultModelForProvider(np);
        sendPatch = { ...sendPatch, model: merged.model };
      }
      if (patch.effort === undefined && !isValidEffort(np, merged.effort)) {
        merged.effort = defaultEffortForProvider(np);
        sendPatch = { ...sendPatch, effort: merged.effort };
      }
    }
    const next: UserConfig = {
      ...userCfg,
      defaults: {
        ...userCfg.defaults,
        [tc]: merged,
      },
    };
    setUserCfg(next);
    setUserCfgError(null);
    scheduleTaskSave(tc, field, sendPatch, merged, () => {
      const confirmedValues = confirmedTaskValuesRef.current;
      setUserCfg((current) => {
        if (!current) return current;
        let rolledBackTask = { ...current.defaults[tc] };
        for (const patchedField of Object.keys(sendPatch) as TaskField[]) {
          const confirmedValue = confirmedValues[`task:${tc}:${patchedField}`];
          if (confirmedValue !== undefined) {
            rolledBackTask = applyConfirmedTaskValue(rolledBackTask, patchedField, confirmedValue);
          }
        }
        return {
          ...current,
          defaults: {
            ...current.defaults,
            [tc]: rolledBackTask,
          },
        };
      });
    });
  }

  // outside click + Esc 關
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

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
      className="settings-popover"
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
      {/* ─── Tab bar + 全域「已儲存」chip ─── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          marginBottom: 14,
          borderBottom: "1px solid var(--line)",
          paddingBottom: 0,
        }}
      >
        {(
          [
            { key: "project", label: "Project" },
            { key: "ai", label: "AI 任務" },
            { key: "notifications", label: "通知" },
            ...(authStatus?.bound === true
              ? ([{ key: "security", label: "安全" }] as const)
              : []),
          ] as ReadonlyArray<{ key: TabKey; label: string }>
        ).map((t) => {
          const isActive = activeTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              style={{
                padding: "7px 12px",
                marginBottom: -1,
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                color: isActive ? "var(--fg)" : "var(--fg-mute)",
                fontSize: 12.5,
                fontWeight: isActive ? 600 : 500,
                cursor: "pointer",
                transition: "color 120ms",
              }}
            >
              {t.label}
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        {savedVisible && (
          <span
            className="chip"
            onTransitionEnd={onSavedTransitionEnd}
            style={{
              color: "var(--done)",
              background: "var(--done-soft)",
              borderColor: "var(--done-soft)",
              opacity: savedFading ? 0 : 1,
              transition: "opacity 350ms ease",
              marginBottom: 6,
            }}
          >
            已儲存 ✓
          </span>
        )}
      </div>

      {/* ─── Project tab ─── */}
      {activeTab === "project" && <>
      <div style={fieldRowStyle}>
        <label style={labelStyle}>平行上限</label>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="number"
            min={MIN}
            max={MAX}
            step={1}
            value={draftMaxParallel}
            onChange={(e) => {
              const nextValue = Number(e.target.value);
              const clamped = Math.max(MIN, Math.min(MAX, Math.floor(nextValue || MIN)));
              setDraftMaxParallel(nextValue);
              scheduleProjectSave(
                "max_parallel",
                { defaults: { max_parallel: clamped } },
                (next) => applyProjectDisplay("max_parallel", next),
                () => {
                  const confirmedValue = confirmedProjectValuesRef.current?.max_parallel;
                  if (confirmedValue !== undefined) setDraftMaxParallel(confirmedValue);
                }
              );
            }}
            disabled={!cfg}
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
          onChange={(e) => {
            const nextValue = e.target.value;
            setDraftBaseBranch(nextValue);
            scheduleProjectSave(
              "default_base_branch",
              { defaults: { default_base_branch: nextValue.trim() } },
              (next) => applyProjectDisplay("default_base_branch", next),
              () => {
                const confirmedValue = confirmedProjectValuesRef.current?.default_base_branch;
                if (confirmedValue !== undefined) setDraftBaseBranch(confirmedValue);
              }
            );
          }}
          disabled={!cfg}
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
            onChange={(e) => {
              const nextValue = e.target.value;
              setDraftCostLimit(nextValue);
              scheduleProjectSave(
                "cost_limit_usd",
                { defaults: { cost_limit_usd: Number(nextValue) } },
                (next) => applyProjectDisplay("cost_limit_usd", next),
                () => {
                  const confirmedValue = confirmedProjectValuesRef.current?.cost_limit_usd;
                  if (confirmedValue !== undefined) setDraftCostLimit(confirmedValue);
                }
              );
            }}
            disabled={!cfg}
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
            onChange={(e) => {
              const nextValue = e.target.checked;
              setDraftAutoMerge(nextValue);
              scheduleProjectSave(
                "auto_merge",
                { defaults: { auto_merge: nextValue } },
                (next) => applyProjectDisplay("auto_merge", next),
                () => {
                  const confirmedValue = confirmedProjectValuesRef.current?.auto_merge;
                  if (confirmedValue !== undefined) setDraftAutoMerge(confirmedValue);
                }
              );
            }}
            disabled={!cfg}
          />
          <span className="toggle-pill-track" aria-hidden>
            <span className="toggle-pill-thumb" />
          </span>
          新 pipeline 預設啟用
        </label>
      </div>
      <div style={subhintStyle}>每條 pipeline 也可單獨切換。</div>
      </>}

      {/* ─── AI 任務 tab ─── */}
      {activeTab === "ai" && <>
      <div style={{ fontSize: 11, color: "var(--fg-faint)", marginBottom: 10 }}>
        跨 project — provider / model
      </div>
      {userCfg ? (
        <div
          className="settings-popover-task-grid"
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
      </>}

      {activeTab === "notifications" && (
        <PushNotificationsSection onActionError={onActionError} />
      )}

      {activeTab === "security" && authStatus?.bound === true && (
        <SecurityTab status={authStatus} onActionError={onActionError} />
      )}

      <div
        className="settings-popover-footer"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          paddingTop: 10,
          borderTop: "1px solid var(--line)",
        }}
      >
        <button type="button" className="btn" onClick={onClose}>
          關閉
        </button>
      </div>
    </div>
  );
}

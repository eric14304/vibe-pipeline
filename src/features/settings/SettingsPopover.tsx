import { useEffect, useRef, useState, type ReactNode } from "react";
import * as api from "../../api/projects";
import * as userConfigApi from "../../api/userConfig";
import { SecurityTab } from "../auth/SecurityTab";
import { useAuthStatus } from "../auth/useAuthStatus";
import { useInstallPrompt } from "../../hooks/useInstallPrompt";
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
  type PushEventKey,
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

const PUSH_EVENT_META: Array<{
  key: PushEventKey;
  label: string;
  sub: string;
  icon: string;
  tone: string;
}> = [
  {
    key: "ticket_done",
    label: "Ticket 完成通知",
    sub: "當 Ticket 完成時收到通知",
    icon: "✓",
    tone: "done",
  },
  {
    key: "ticket_failed",
    label: "Ticket 失敗通知",
    sub: "當 Ticket 失敗時收到通知",
    icon: "✕",
    tone: "failed",
  },
  {
    key: "pipeline_paused",
    label: "Pipeline 暫停通知",
    sub: "當 Pipeline 暫停需回應時收到通知",
    icon: "⏸",
    tone: "paused",
  },
  {
    key: "auto_merge_conflict",
    label: "AI 衝突處理通知",
    sub: "當 AI 接手解衝突時收到通知",
    icon: "AI",
    tone: "iter",
  },
];

type TaskIconKind = "qa" | "split" | "runner" | "executor" | "critic" | "merge";

const TASK_ICON: Record<TaskClass, TaskIconKind> = {
  qa: "qa",
  split: "split",
  runner: "runner",
  executor: "executor",
  critic: "critic",
  merge: "merge",
};

const TASK_TONE: Record<TaskClass, string> = {
  qa: "blue",
  split: "violet",
  runner: "green",
  executor: "amber",
  critic: "red",
  merge: "teal",
};

function TaskIconGlyph({ kind }: { kind: TaskIconKind }) {
  if (kind === "executor") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M13 2 5 14h6l-1 8 8-12h-6l1-8Z" />
      </svg>
    );
  }
  if (kind === "critic") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3 5 6v5c0 4.1 2.8 7.9 7 9.8 4.2-1.9 7-5.7 7-9.8V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </svg>
    );
  }
  if (kind === "merge") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M7 4v6a4 4 0 0 0 4 4h6" />
        <path d="M17 8v12" />
        <path d="M4 7l3-3 3 3" />
        <path d="M14 17l3 3 3-3" />
      </svg>
    );
  }
  if (kind === "split") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M7 4v16" />
        <path d="M7 8h6a4 4 0 0 1 4 4v8" />
        <path d="M4 7l3-3 3 3" />
      </svg>
    );
  }
  if (kind === "runner") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M8 19v-2a4 4 0 0 1 4-4h1" />
        <circle cx="10" cy="8" r="4" />
        <path d="m15 17 2 2 4-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 3h8l4 4v14H7V3Z" />
      <path d="M15 3v5h4" />
      <path d="M10 12h5" />
      <path d="M10 16h4" />
    </svg>
  );
}

function AiTaskRow({
  icon,
  tone,
  label,
  sub,
  provider,
  model,
  effort,
  showProvider,
  showEffort,
  disabled,
  onChange,
}: {
  icon: TaskIconKind;
  tone: string;
  label: string;
  sub?: string;
  provider: Provider;
  model: ModelName;
  effort: Effort;
  showProvider: boolean;
  showEffort: boolean;
  disabled?: boolean;
  onChange: (patch: { provider?: Provider; model?: ModelName; effort?: Effort }) => void;
}) {
  return (
    <div className="settings-row ai-task-row">
      <div className="settings-row-label">
        <div className="settings-row-identity">
          <span className={"settings-row-icon settings-icon-badge settings-icon-badge--" + tone} aria-hidden>
            <TaskIconGlyph kind={icon} />
          </span>
          <div className="settings-row-text">
            <div className="settings-row-label-head">{label}</div>
            {sub && <div className="settings-row-label-sub">{sub}</div>}
          </div>
        </div>
      </div>
      <div className="settings-row-control settings-row-control--multi">
        <select
          className="settings-input"
          value={model}
          disabled={disabled}
          onChange={(e) => onChange({ model: e.target.value as ModelName })}
        >
          {modelsForProvider(provider).map((m) => (
            <option key={m} value={m}>
              {m.replace(/^claude-/, "")}
            </option>
          ))}
        </select>
        {showProvider && (
          <select
            className="settings-input"
            value={provider}
            disabled={disabled}
            onChange={(e) => onChange({ provider: e.target.value as Provider })}
          >
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
        {showEffort && (
          <select
            className="settings-input"
            value={effort}
            disabled={disabled}
            onChange={(e) => onChange({ effort: e.target.value as Effort })}
          >
            {effortsForProvider(provider).map((eff) => (
              <option key={eff} value={eff}>
                {eff}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function TipCard({
  title = "小提醒",
  children,
  compact,
}: {
  title?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={"settings-tip-card" + (compact ? " settings-tip-card--compact" : "")}>
      <div className="settings-tip-copy">
        <div className="settings-tip-title">{title}</div>
        <div className="settings-tip-body">{children}</div>
      </div>
    </div>
  );
}

function InfoDot() {
  return <span className="settings-info-dot settings-info-dot--small" aria-hidden>i</span>;
}

function PushNotificationsSection({
  userCfg,
  pushSaving,
  onTogglePushEvent,
  onActionError,
}: {
  userCfg: UserConfig | null;
  pushSaving: Partial<Record<PushEventKey, boolean>>;
  onTogglePushEvent: (key: PushEventKey, enabled: boolean) => void;
  onActionError?: (message: string) => void;
}) {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>(getPermission());
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

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
    setLastError(null);
    try {
      await requestAndRegisterToken();
      refreshPermission();
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "啟用通知失敗";
      setLastError(message);
      onActionError?.(message);
      refreshPermission();
    } finally {
      setLoading(false);
    }
  }

  async function disable() {
    setLoading(true);
    setLastError(null);
    try {
      await unregisterFcm();
      refreshPermission();
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : "停用通知失敗";
      setLastError(message);
      onActionError?.(message);
    } finally {
      setLoading(false);
    }
  }

  const enabled = permission === "granted" && !!token;
  const mainDisabled = supported === false || loading || supported === null;
  const eventsDisabled = !enabled;

  async function recheckPermission() {
    // permission==='default' → 觸發 requestPermission(走完整 enable 流程,連帶註冊 token)
    // permission==='denied' / 'granted' 也走 enable;denied 會丟錯,被 catch 後 refreshPermission 重讀
    await enable();
  }

  return (
    <div>
      {supported === false ? (
        <div className="push-status-banner push-status-banner--info">
          <div className="push-status-banner-text">此瀏覽器不支援 Web Push</div>
        </div>
      ) : permission !== "granted" ? (
        <div className="push-status-banner push-status-banner--warn">
          <div className="push-status-banner-text">
            尚未允許通知權限
            <div className="push-status-banner-sub">
              {permission === "denied"
                ? "已被瀏覽器封鎖,請至網址列設定重新允許後再回此頁啟用"
                : "請允許瀏覽器顯示通知,才能收到推播訊息"}
            </div>
          </div>
          <button
            type="button"
            className="push-status-banner-btn"
            onClick={() => void recheckPermission()}
            disabled={loading}
          >
            {loading ? "處理中…" : "重新檢查權限"}
          </button>
        </div>
      ) : null}

      <label
        className={
          "toggle-pill mono push-main-toggle" +
          (enabled ? " is-on" : "") +
          (mainDisabled ? " is-disabled" : "")
        }
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={mainDisabled}
          onChange={(e) => {
            if (e.target.checked) void enable();
            else void disable();
          }}
        />
        <span className="toggle-pill-track" aria-hidden>
          <span className="toggle-pill-thumb" />
        </span>
        啟用推播通知
      </label>

      <div
        className={"push-events-list" + (eventsDisabled ? " is-disabled" : "")}
        role="group"
        aria-label="推播事件"
      >
        {PUSH_EVENT_META.map((item, idx) => {
          const checked = (userCfg?.pushEvents[item.key] ?? true) && enabled;
          const rowDisabled = eventsDisabled || !userCfg || !!pushSaving[item.key];
          return (
            <div
              key={item.key}
              className={"settings-row push-event-row" + (eventsDisabled ? " push-row-disabled" : "")}
            >
              <div className="settings-row-label">
                <div className="settings-row-identity">
                  <span
                    className={"settings-row-icon push-event-icon push-event-icon--" + item.tone}
                    aria-hidden
                  >
                    {item.icon}
                  </span>
                  <div className="settings-row-text">
                    <div className="settings-row-label-head">{item.label}</div>
                    <div className="settings-row-label-sub">{item.sub}</div>
                    {idx === 0 && eventsDisabled && (
                      <div className="settings-row-label-sub push-event-hint">請先啟用推播通知</div>
                    )}
                  </div>
                </div>
              </div>
              <div className="settings-row-control">
                <label
                  className={"toggle-pill mono" + (checked ? " is-on" : "") + (rowDisabled ? " is-disabled" : "")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={rowDisabled}
                    onChange={(e) => onTogglePushEvent(item.key, e.target.checked)}
                  />
                  <span className="toggle-pill-track" aria-hidden>
                    <span className="toggle-pill-thumb" />
                  </span>
                </label>
              </div>
              {eventsDisabled && (
                <div className="settings-row-hint push-event-lock">需先啟用推播通知</div>
              )}
            </div>
          );
        })}
      </div>

      {lastError && (
        <div className="mono push-error">
          {lastError}
        </div>
      )}
    </div>
  );
}

function detectPlatform(): "ios" | "chromium" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
  if (isIOS) return "ios";
  // Chrome / Edge / Android Chrome / Samsung Internet 都帶 Chrome,且非 iOS
  if (/Chrome|CriOS|EdgA?|Edg|SamsungBrowser/i.test(ua)) return "chromium";
  return "other";
}

function InstallAppSection({ onActionError }: { onActionError?: (message: string) => void }) {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [busy, setBusy] = useState(false);
  const platform = detectPlatform();

  async function onClick() {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === "unavailable") {
        onActionError?.("此瀏覽器無法觸發安裝,請改用瀏覽器選單的「安裝 App」");
      }
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = installed
    ? "已安裝"
    : platform === "other"
      ? "此瀏覽器不支援"
      : "尚未安裝";
  const statusIcon = installed ? "✓" : platform === "other" ? "!" : "▯";
  const statusTone: "ok" | "warn" | "neutral" = installed ? "ok" : platform === "other" ? "warn" : "neutral";

  return (
    <div className="settings-section settings-section--plain">
      <div className="settings-feature-row">
        <div className="settings-feature-label">
          <div className="settings-feature-title">安裝為 App</div>
          <div className="settings-feature-sub">將此網站安裝為 App,可更快開啟並接收推播通知。</div>
        </div>

        <div className="install-panel">
        {/* chip 1:狀態 */}
        <div className={"install-chip install-chip--status install-chip--tone-" + statusTone}>
          <div className={"install-chip-status-icon install-chip-status-icon--" + statusTone} aria-hidden>
            {statusIcon}
          </div>
          <div className="install-chip-text">
            <div className="install-chip-status-label">{statusLabel}</div>
            <div className="install-chip-hint">安裝後可在桌面或主畫面開啟</div>
          </div>
        </div>

        {/* chip 2:Chrome / Edge / Android */}
        <div className={"install-chip" + (platform === "chromium" ? " install-chip--active" : "")}>
          <div className="install-chip-title">Chrome / Edge / Android</div>
          <div className="install-chip-body">
            {installed ? (
              <div className="install-chip-hint">已安裝</div>
            ) : canInstall ? (
              <button
                type="button"
                className="btn install-chip-btn"
                disabled={busy}
                onClick={() => void onClick()}
              >
                {busy ? "處理中…" : "安裝"}
              </button>
            ) : (
              <div className="install-chip-hint">
                點擊網址列右側的
                <span className="install-inline-icon" aria-hidden>
                  <svg viewBox="0 0 24 24">
                    <path d="M12 4v10" />
                    <path d="m8 10 4 4 4-4" />
                    <path d="M5 19h14" />
                  </svg>
                </span>
                安裝
              </div>
            )}
          </div>
        </div>

        {/* chip 3:iOS Safari */}
        <div className={"install-chip" + (platform === "ios" ? " install-chip--active" : "")}>
          <div className="install-chip-title">iOS Safari <span className="settings-title-muted">(不支援安裝)</span></div>
          <div className="install-chip-body">
            <div className="install-chip-hint">
              點擊「分享」→「加入主畫面」即可從主畫面開啟
            </div>
          </div>
        </div>
      </div>
      </div>
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
  const [pushSaving, setPushSaving] = useState<Partial<Record<PushEventKey, boolean>>>({});
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
        // backend cascade(2026-05-13):改 runner.provider 時 executor/critic/merge.provider 自動同步,
        // 必須拿 response 覆寫 local state,不能只信 desiredTask(只 cover 當 tc)
        const fresh = await userConfigApi.updateUserConfig({ defaults: { [tc]: patch } }, signal);
        if (seqRef.current[key] !== seq) return;
        savedUserCfgRef.current = fresh;
        setUserCfg(fresh);
        setConfirmedTaskValues(fresh);
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

  function updatePushEvent(key: PushEventKey, enabled: boolean) {
    if (!userCfg) return;
    const prev = userCfg.pushEvents[key];
    const next: UserConfig = {
      ...userCfg,
      pushEvents: {
        ...userCfg.pushEvents,
        [key]: enabled,
      },
    };
    setUserCfg(next);
    setUserCfgError(null);
    setPushSaving((current) => ({ ...current, [key]: true }));
    userConfigApi
      .updateUserConfig({ pushEvents: { [key]: enabled } })
      .then((fresh) => {
        savedUserCfgRef.current = fresh;
        setUserCfg(fresh);
        setConfirmedTaskValues(fresh);
        showSaved();
      })
      .catch((e: unknown) => {
        toastSaveError(e);
        setUserCfg((current) => {
          if (!current) return current;
          return {
            ...current,
            pushEvents: {
              ...current.pushEvents,
              [key]: prev,
            },
          };
        });
      })
      .finally(() => {
        setPushSaving((current) => ({ ...current, [key]: false }));
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

  return (
    <div
      ref={wrapRef}
      className="settings-popover"
      role="dialog"
      aria-label="設定"
    >
      {/* 手機右上關閉按鈕 — desktop 隱藏(點外面 / Esc 已夠) */}
      <button
        type="button"
        className="settings-popover-close"
        onClick={onClose}
        aria-label="關閉設定"
        title="關閉"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      {/* ─── Tab bar + 全域「已儲存」chip ─── */}
      <div className="settings-popover-tabs">
        {(
          [
            { key: "project", label: "Project" },
            { key: "ai", label: "AI 任務" },
            { key: "notifications", label: "PWA" },
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
              className={"settings-popover-tab settings-popover-tab--" + t.key + (isActive ? " is-active" : "")}
            >
              {t.label}
            </button>
          );
        })}
        <span className="settings-popover-tabs-spacer" />
        {savedVisible && (
          <span
            className={"chip settings-popover-saved" + (savedFading ? " is-fading" : "")}
            onTransitionEnd={onSavedTransitionEnd}
          >
            已儲存 ✓
          </span>
        )}
      </div>

      {/* ─── Project tab ─── */}
      {activeTab === "project" && <>
      <div className="settings-card settings-project-card">
      <div className="settings-row">
        <div className="settings-row-label">
          <div className="settings-row-label-head">
            平行上限
            <span className="settings-info-dot" aria-hidden>i</span>
          </div>
          <div className="settings-row-label-sub">{MIN}–{MAX} 條</div>
        </div>
        <div className="settings-row-control">
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
            className="mono settings-input settings-input--w-narrow"
          />
        </div>
        <div className="settings-row-hint">達上限後新 Run 排隊,前面跑完自動接棒</div>
      </div>

      <div className="settings-row">
        <div className="settings-row-label">
          <div className="settings-row-label-head">
            Base branch
          </div>
          <div className="settings-row-label-sub">預設用於新建 pipeline</div>
        </div>
        <div className="settings-row-control">
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
            className="mono settings-input settings-input--w-mid"
          />
        </div>
        <div className="settings-row-hint">新 pipeline 從這個 branch 切</div>
      </div>

      <div className="settings-row">
        <div className="settings-row-label">
          <div className="settings-row-label-head">
            Cost 上限
            <span className="settings-info-dot" aria-hidden>i</span>
          </div>
          <div className="settings-row-label-sub">USD，0 = 無限</div>
        </div>
        <div className="settings-row-control settings-row-control--multi settings-cost-control">
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
            className="mono settings-input settings-input--w-mid"
          />
          <span className="mono settings-inline-unit">USD</span>
        </div>
        <div className="settings-row-hint">每條 pipeline 個別累計上限,超過則不會跑其他 pipeline / run</div>
      </div>

      <div className="settings-row settings-row--auto-merge">
        <div className="settings-row-label">
          <div className="settings-row-label-head">
            自動合併
            <span className="settings-info-dot" aria-hidden>i</span>
          </div>
          <div className="settings-row-label-sub">每條 pipeline 可單獨調整</div>
        </div>
        <div className="settings-row-control settings-row-control--wide">
          <div className="settings-merge-panel">
          <label
            className={"toggle-pill mono" + (draftAutoMerge ? " is-on" : "")}
            title="全 ticket done → backend 自動 append merge ticket 走 runner 流程"
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
          <div className="settings-inline-alert">
            <span className="settings-inline-alert-icon" aria-hidden>i</span>
            啟用後,符合條件時將自動合併到 base branch。
          </div>
          </div>
        </div>
      </div>
      </div>

      <TipCard>以上設定會套用於新建立的 pipeline，已存在的 pipeline 不受影響。</TipCard>
      </>}

      {/* ─── AI 任務 tab ─── */}
      {activeTab === "ai" && <>
      {userCfg ? (
        <>
        <div className="settings-section">
          <div className="settings-section-heading">
            <div>
              <div className="settings-section-title">全域 provider / model 設定</div>
              <div className="settings-section-sub">設定預設模型與強度,將套用於全域任務與 AI 流程。</div>
            </div>
            <a
              className="settings-section-link"
              href="https://docs.anthropic.com/"
              target="_blank"
              rel="noreferrer"
            >
              模型與強度說明
            </a>
          </div>
          <div className="settings-ai-card settings-ai-card--global">
            <div className="settings-ai-header">
              <span />
              <span>模型 (Model) <InfoDot /></span>
              <span>Provider <InfoDot /></span>
              <span>強度 (Intensity) <InfoDot /></span>
            </div>
          {(["qa", "split", "runner"] as const).map((tc) => (
            <AiTaskRow
              key={tc}
              icon={TASK_ICON[tc]}
              tone={TASK_TONE[tc]}
              label={TASK_CLASS_LABELS[tc]}
              sub={TASK_CLASS_HINTS[tc]}
              provider={userCfg.defaults[tc].provider}
              model={userCfg.defaults[tc].model}
              effort={userCfg.defaults[tc].effort}
              showProvider
              showEffort
              onChange={(patch) => updateTask(tc, patch)}
            />
          ))}
          </div>
        </div>

        <div className="settings-section settings-ai-advanced">
          <div className="settings-advanced-head">
            <span className="settings-icon-badge settings-icon-badge--amber" aria-hidden>
              <TaskIconGlyph kind="executor" />
            </span>
            <div>
              <div className="settings-section-title">進階設定 <span className="settings-title-muted">(可依需求調整)</span></div>
              <div className="settings-section-sub">為提升速度與節省 Token,請依任務重要性調整模型與強度。</div>
            </div>
          </div>
          <div className="settings-ai-card settings-ai-card--advanced">
          {(["executor", "critic", "merge"] as const).map((tc) => (
            <AiTaskRow
              key={tc}
              icon={TASK_ICON[tc]}
              tone={TASK_TONE[tc]}
              label={TASK_CLASS_LABELS[tc]}
              sub={TASK_CLASS_HINTS[tc]}
              provider={userCfg.defaults[tc].provider}
              model={userCfg.defaults[tc].model}
              effort={userCfg.defaults[tc].effort}
              showProvider={false}
              showEffort
              onChange={(patch) => updateTask(tc, patch)}
            />
          ))}
          </div>
        </div>

        <TipCard>變更設定將套用於新任務，進行中的任務不受影響。</TipCard>
        </>
      ) : (
        <div className="settings-subhint">載入中…</div>
      )}
      {userCfgError && (
        <div className="mono settings-error">{userCfgError}</div>
      )}

      {error && (
        <div className="mono settings-error">{error}</div>
      )}
      </>}

      {activeTab === "notifications" && (
        <>
          <InstallAppSection onActionError={onActionError} />
          <div className="settings-section settings-notify-section">
            <div className="settings-section-heading">
              <div>
                <div className="settings-section-title">推播通知</div>
                <div className="settings-section-sub">開啟後,系統事件發生時會推送通知到此裝置。</div>
              </div>
              <a
                className="settings-section-link"
                href="https://web.dev/articles/push-notifications-overview"
                target="_blank"
                rel="noreferrer"
              >
                了解更多
              </a>
            </div>
            <div className="settings-card settings-push-card">
            <PushNotificationsSection
              userCfg={userCfg}
              pushSaving={pushSaving}
              onTogglePushEvent={updatePushEvent}
              onActionError={onActionError}
            />
            <TipCard compact>通知會推送到此裝置（背景或前景皆可）。</TipCard>
            </div>
          </div>
        </>
      )}

      {activeTab === "security" && authStatus?.bound === true && (
        <SecurityTab status={authStatus} onActionError={onActionError} />
      )}

    </div>
  );
}

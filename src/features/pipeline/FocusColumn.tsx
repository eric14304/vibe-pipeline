import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, FolderIcon, MergeIcon, PlusIcon } from "../../ui/icons";
import { STATE_COLOR, STATE_LABEL, fmtElapsed } from "../../data/pipelines";
import { MODE_LABELS } from "../../api/qa";
import { useConfirm } from "../../ui/ConfirmDialog";
import { DiffModal } from "./DiffModal";
import type { IterStage, Pipeline, Ticket, TicketStatus } from "../../types/pipeline";
import * as api from "../../api/projects";
import type { RunSummary } from "../../api/projects";

// RunButton 狀態決策表(authoritative)— 加新 PipelineState 一定要在 switch 補,
// 不然 TS exhaustive `never` 編譯就 fail。
export function RunButton({
  pipeline,
  onRun,
  onPause,
  lastRun,
  spawning = false,
}: {
  pipeline: Pipeline;
  onRun?: (id: string) => void;
  onPause?: (id: string) => void;
  lastRun?: RunSummary | null;
  // user 點 開始/繼續/重試 後 → 等 polling 看到 state 跳出 planning/paused/failed 為止
  // 避開「點下去看似沒反應」的視覺空窗(POST 回來到第一個 ticket 真跑可能 0-7s)
  spawning?: boolean;
}) {
  const s = pipeline.state;
  const noTickets = pipeline.tickets.length === 0;
  const lastDur = lastRun?.durationMs ? fmtRunDur(lastRun.durationMs) : null;

  // spawning 期間統一顯「啟動中…」覆蓋掉原本的「開始/繼續/重試」狀態
  if (spawning && (s === "planning" || s === "paused" || s === "failed")) {
    return (
      <button type="button" className="btn" disabled title="啟動 runner session…">
        <span className="qadr-thinking-dots" style={{ display: "inline-flex", verticalAlign: "middle" }}>
          <span /><span /><span />
        </span>{" "}
        啟動中
      </button>
    );
  }

  switch (s) {
    case "running":
      return (
        <button type="button" className="btn" onClick={() => onPause?.(pipeline.id)} title="暫停">
          ⏸ 暫停
        </button>
      );
    case "stopping":
      return (
        <button type="button" className="btn" disabled title="停止中…">
          <span className="qadr-thinking-dots" style={{ display: "inline-flex", verticalAlign: "middle" }}>
            <span /><span /><span />
          </span>{" "}
          停止中
        </button>
      );
    case "ready":
      return (
        <button type="button" className="btn" disabled title="所有 ticket 已完成">
          ✓ 全部完成
        </button>
      );
    case "merged":
      return (
        <button type="button" className="btn" disabled title="Pipeline 已合併進 base branch,要再跑開新 pipeline">
          ✓ 已合併
        </button>
      );
    case "planning":
    case "paused":
    case "failed": {
      // 沒「可跑」的 real ticket = 沒 ticket / 都 done / 只剩 merge ticket。
      // merge ticket 不認列(它的 retry 走 ReadyBanner,RunButton 是 step/iter 用的)。
      const hasRunnableReal = pipeline.tickets.some(
        (t) =>
          t.mode !== "merge" &&
          (t.status === "draft" || t.status === "ready" || t.status === "paused")
      );
      if (noTickets || !hasRunnableReal) {
        const title = noTickets
          ? "按上方「+ ticket」開 QA 建第一張"
          : "沒可跑的 ticket(失敗 / done 不算可跑;merge 處理走 banner)";
        return (
          <button type="button" className="btn" disabled title={title}>
            無ticket可執行
          </button>
        );
      }
      const titleBase = s === "paused" ? "繼續" : s === "failed" ? "重試" : "開始運行";
      const title = lastDur ? `${titleBase}(上次 ${lastDur})` : titleBase;
      return (
        <button type="button"
          className="btn btn-primary"
          onClick={() => onRun?.(pipeline.id)}
          title={title}
        >
          ▶ {titleBase}
          {lastDur && (
            <span className="mono" style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>
              ~{lastDur}
            </span>
          )}
        </button>
      );
    }
    default: {
      // exhaustive check:加新 PipelineState 沒在上面 case 補,這裡會 type error
      const _exhaustive: never = s;
      void _exhaustive;
      return null;
    }
  }
}

function fmtRunDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m${sec ? ` ${sec}s` : ""}`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}


export function FocusColumn({
  pipeline,
  tick,
  onAddTicket,
  hasActiveDraft = false,
  onRun,
  onPause,
  onDelete,
  onRename,
  onResetAll,
  onRevealWorktree,
  onMerge,
  existingNames = [],
  onTicketClick,
  projectHash,
  mergeStrategy,
}: {
  pipeline: Pipeline;
  tick: number;
  onAddTicket?: (pipelineId: string) => void;
  hasActiveDraft?: boolean;
  onRun?: (pipelineId: string) => void;
  onPause?: (pipelineId: string) => void;
  onDelete?: (pipelineId: string) => void;
  onRename?: (pipelineId: string, newName: string) => void;
  onResetAll?: (pipelineId: string) => void;
  onRevealWorktree?: (pipelineId: string) => void;
  onMerge?: (pipelineId: string) => void;
  existingNames?: string[];
  onTicketClick?: (ticket: Ticket) => void;
  projectHash?: string;
  mergeStrategy?: string;
}) {
  // Runs summary 給 head chip + RunButton 預估用。pipeline.id / state 變動就 refetch
  // (state 變表示可能新跑完一次)。失敗安靜忽略 — 純資訊性。
  const [runs, setRuns] = useState<RunSummary[]>([]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: pipeline.state is the refetch trigger (state change ≈ new run)
  useEffect(() => {
    if (!projectHash) return;
    let cancelled = false;
    api
      .listPipelineRuns(projectHash, pipeline.id)
      .then((arr) => {
        if (!cancelled) setRuns(arr);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [projectHash, pipeline.id, pipeline.state]);

  // Worktree diff stat — fetch once on mount(讓 paused/ready 也看得到歷史 diff),
  // running/stopping 時 poll 每 3s 看即時進度。merged 後不打(已合進 base 沒意義)。
  const [diffStat, setDiffStat] = useState<api.DiffStat | null>(null);
  // DiffModal 開關 — 由 head 上 chip 點擊觸發,任何 banner 不在的狀態都看得到
  const [diffOpen, setDiffOpen] = useState(false);
  useEffect(() => {
    if (!projectHash || pipeline.state === "merged" || pipeline.state === "planning") {
      setDiffStat(null);
      return;
    }
    let cancelled = false;
    const tick = () => {
      api
        .getDiffStat(projectHash, pipeline.id)
        .then((d) => {
          if (!cancelled) setDiffStat(d);
        })
        .catch(() => {});
    };
    tick();
    // 只 running/stopping 時持續 poll;paused/ready/failed 一次抓完就好
    const live = pipeline.state === "running" || pipeline.state === "stopping";
    const id = live ? setInterval(tick, 3000) : null;
    return () => {
      cancelled = true;
      if (id) clearInterval(id);
    };
  }, [projectHash, pipeline.id, pipeline.state]);
  const totalCost = runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const lastRun = runs[0] ?? null;
  const stateColor = STATE_COLOR[pipeline.state];
  const stateLabel = STATE_LABEL[pipeline.state];
  const done = pipeline.tickets.filter((t) => t.status === "done").length;
  const total = pipeline.tickets.length;
  const allDone = done === total && pipeline.state === "ready";
  // 看是否有失敗 / paused 的 merge ticket(讓 banner 顯重試,不靠 RunButton 的繼續)
  const failedMergeTicket = pipeline.tickets.find(
    (t) =>
      t.mode === "merge" &&
      (t.status === "failed" ||
        t.status === "failed_iter_limit" ||
        t.status === "failed_transient" ||
        t.status === "paused")
  );
  // ready = 全 ticket done 還沒合併;merged = 已合併;有失敗 merge → 也顯 banner 給 user 重試。
  const showMergeBanner = allDone || pipeline.state === "merged" || !!failedMergeTicket;
  const hasResettable = pipeline.tickets.some((t) =>
    t.status === "done" ||
    t.status === "failed" ||
    t.status === "failed_iter_limit" ||
    t.status === "failed_transient"
  );
  const lockedByState =
    pipeline.state === "running" || pipeline.state === "stopping";

  // Spawning state:點 開始/繼續/重試 後到 polling 看到 state 跳出 [planning/paused/failed]。
  // 解掉「點下去看似沒反應」的視覺空窗(POST 回 → state.json 寫入 → polling 抓到 ≤ 1.5s + claude 啟動 0~5s)。
  const [spawning, setSpawning] = useState(false);
  // pipeline.state 跳出可點擊狀態 = 真的進場了 → 清 spawning
  useEffect(() => {
    if (
      pipeline.state !== "planning" &&
      pipeline.state !== "paused" &&
      pipeline.state !== "failed"
    ) {
      setSpawning(false);
    }
  }, [pipeline.state]);
  // 安全網:15s 還沒進場視同失敗(打了 API 沒生效),解除 spawning 讓 user 重試
  useEffect(() => {
    if (!spawning) return;
    const id = setTimeout(() => setSpawning(false), 15000);
    return () => clearTimeout(id);
  }, [spawning]);

  return (
    <main className="focus" key={pipeline.id}>
      <div className="focus-head fade-up">
        <div className="focus-head-top">
          <FocusTitle
            pipeline={pipeline}
            onRename={onRename}
            existingNames={existingNames}
          />
          <span className="chip mono">
            <span style={{ color: "var(--fg-mute)" }}>⎇</span> {pipeline.branch}
          </span>
          <span
            className="chip chip-state"
            style={{
              color: stateColor,
              borderColor: "transparent",
              background: "color-mix(in srgb, " + stateColor + " 14%, transparent)",
            }}
          >
            <span className="dot" style={{ background: stateColor }} /> {stateLabel}
          </span>
          <span className="focus-count mono">
            {done} / {total} done
          </span>
          {runs.length > 0 && (
            <span
              className="chip mono"
              title={`累計 ${runs.length} 次執行,共 $${totalCost.toFixed(2)}`}
              style={{ fontSize: 11, color: "var(--fg-mute)" }}
            >
              {runs.length} run{runs.length === 1 ? "" : "s"} · $
              {totalCost.toFixed(2)}
            </span>
          )}
          {diffStat && (diffStat.files > 0 || diffStat.added > 0 || diffStat.deleted > 0) && projectHash && (
            <button
              type="button"
              className="chip mono"
              title={`點擊看完整 diff:${diffStat.files} files,+${diffStat.added} -${diffStat.deleted} vs ${pipeline.baseBranch || "base"}`}
              style={{ fontSize: 11, cursor: "pointer", border: "1px solid var(--line)", background: "transparent" }}
              onClick={() => setDiffOpen(true)}
            >
              <span style={{ color: "var(--done)" }}>+{diffStat.added}</span>
              <span style={{ color: "var(--fg-faint)", margin: "0 4px" }}>·</span>
              <span style={{ color: "var(--failed)" }}>-{diffStat.deleted}</span>
              <span style={{ color: "var(--fg-mute)", marginLeft: 6 }}>{diffStat.files}f</span>
            </button>
          )}
          {diffOpen && projectHash && (
            <DiffModal
              projectHash={projectHash}
              pipelineId={pipeline.id}
              pipelineBranch={pipeline.branch}
              baseBranch={pipeline.baseBranch || "main"}
              onClose={() => setDiffOpen(false)}
            />
          )}

          <button type="button" className="btn" onClick={() => onAddTicket?.(pipeline.id)}>
            <PlusIcon /> {hasActiveDraft ? "接續 QA" : "ticket"}
          </button>

          <span style={{ flex: 1 }} />

          <RunButton
            pipeline={pipeline}
            onRun={(pid) => {
              setSpawning(true);
              onRun?.(pid);
            }}
            onPause={onPause}
            lastRun={lastRun}
            spawning={spawning}
          />
          <OverflowMenu
            pipeline={pipeline}
            hasResettable={hasResettable}
            lockedByState={lockedByState}
            onResetAll={onResetAll}
            onRevealWorktree={onRevealWorktree}
            onDelete={onDelete}
          />
        </div>

        {showMergeBanner && (
          <ReadyBanner
            pipeline={pipeline}
            onMerge={onMerge}
            mergeStrategy={mergeStrategy}
          />
        )}
      </div>

      <div className="focus-list">
        {pipeline.tickets.length === 0 ? (
          <EmptyTickets
            hasActiveDraft={hasActiveDraft}
            onAddTicket={() => onAddTicket?.(pipeline.id)}
          />
        ) : (
          pipeline.tickets.map((t, i) => (
            <TicketCard
              key={t.id}
              ticket={t}
              tick={tick}
              index={i}
              onClick={onTicketClick ? () => onTicketClick(t) : undefined}
            />
          ))
        )}
      </div>
    </main>
  );
}

function EmptyTickets({
  hasActiveDraft,
  onAddTicket,
}: {
  hasActiveDraft: boolean;
  onAddTicket: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "60px 24px",
        color: "var(--fg-mute)",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 14,
          color: "var(--fg)",
          fontWeight: 500,
        }}
      >
        {hasActiveDraft ? "有一張 ticket 在 QA 中" : "還沒任何 ticket"}
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.6, maxWidth: 360 }}>
        {hasActiveDraft
          ? "之前開了 QA 但沒收尾,點下方按鈕接續對話。"
          : "用「+ ticket」開 QA drawer,跟 AI 對話收斂出 goal / acceptance / prompt,完成後加進 pipeline。"}
      </div>
      <button type="button"
        className="btn btn-primary"
        onClick={onAddTicket}
        style={{ marginTop: 4 }}
      >
        <PlusIcon /> {hasActiveDraft ? "接續 QA" : "建第一張 ticket"}
      </button>
    </div>
  );
}

// Pipeline 級操作的 overflow menu(原本一字排開太擠,收進 ⋯ 內)。
// 各 action 用 useConfirm() 二次確認(刪除 / 重跑全部);reveal 不需要。
function OverflowMenu({
  pipeline,
  hasResettable,
  lockedByState,
  onResetAll,
  onRevealWorktree,
  onDelete,
}: {
  pipeline: Pipeline;
  hasResettable: boolean;
  lockedByState: boolean;
  onResetAll?: (id: string) => void;
  onRevealWorktree?: (id: string) => void;
  onDelete?: (id: string) => void;
}) {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
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

  // 沒任何 action 可做就不顯示
  if (!onResetAll && !onRevealWorktree && !onDelete) return null;

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block" }}>
      <button type="button"
        className="btn btn-ghost"
        onClick={() => setOpen((o) => !o)}
        title="更多操作"
        aria-haspopup="menu"
        aria-expanded={open}
        style={{ padding: "2px 8px", fontSize: 14, lineHeight: 1 }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            minWidth: 260,
            whiteSpace: "nowrap",
            background: "var(--bg-elevated)",
            border: "1px solid var(--line)",
            borderRadius: 6,
            boxShadow: "var(--shadow-lg)",
            padding: 4,
            zIndex: 1000,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {onRevealWorktree && (
            <MenuItem
              icon={<FolderIcon />}
              label="開啟 worktree"
              hint="檔案總管"
              onClick={() => {
                setOpen(false);
                onRevealWorktree(pipeline.id);
              }}
            />
          )}
          {onResetAll && hasResettable && (
            <MenuItem
              icon={<span>↺</span>}
              label="重跑全部"
              hint={lockedByState ? "running 中" : "重置 done/failed → draft"}
              disabled={lockedByState}
              onClick={async () => {
                setOpen(false);
                const ndone = pipeline.tickets.filter((t) => t.status === "done").length;
                const nfail = pipeline.tickets.filter((t) =>
                  t.status === "failed" ||
                  t.status === "failed_iter_limit" ||
                  t.status === "failed_transient"
                ).length;
                const ok = await confirm({
                  title: "重跑全部?",
                  description:
                    `會把以下 ticket 狀態回到 draft:\n` +
                    ` · ${ndone} done\n` +
                    ` · ${nfail} failed\n\n` +
                    `清掉 iter rounds / commits 紀錄;worktree 內已 commit 的程式碼留著。\n` +
                    `下次按「開始運行」會把 draft 全跑一遍。`,
                  confirmLabel: "重跑全部",
                  danger: true,
                });
                if (ok) onResetAll(pipeline.id);
              }}
            />
          )}
          {onDelete && (
            <MenuItem
              icon={<span>⌫</span>}
              label="刪除 pipeline"
              hint={lockedByState ? "running 中" : "worktree 不動"}
              disabled={lockedByState}
              danger
              onClick={async () => {
                setOpen(false);
                const ok = await confirm({
                  title: `刪除 pipeline "${pipeline.name}"?`,
                  description:
                    `pipeline.json 會清掉,但 worktree (~/.vibe-pipeline/worktrees/...) 留著。`,
                  confirmLabel: "刪除",
                  danger: true,
                });
                if (ok) onDelete(pipeline.id);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  hint,
  disabled,
  danger,
  onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "grid",
        gridTemplateColumns: "16px 1fr auto",
        gap: 8,
        alignItems: "center",
        padding: "6px 10px",
        background: "transparent",
        border: 0,
        borderRadius: 4,
        textAlign: "left",
        color: disabled ? "var(--fg-faint)" : danger ? "var(--failed)" : "var(--fg)",
        cursor: disabled ? "not-allowed" : "pointer",
        font: "inherit",
        fontSize: 12.5,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = "var(--panel-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ display: "inline-flex", justifyContent: "center" }}>
        {icon}
      </span>
      <span style={{ whiteSpace: "nowrap" }}>{label}</span>
      {hint && (
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--fg-faint)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {hint}
        </span>
      )}
    </button>
  );
}

// 可編輯的 pipeline title — 點 ✎ 進編輯模式,Enter 存,Esc 取消。
// 重名 / 格式不對 / running / stopping 不准存。
function FocusTitle({
  pipeline,
  onRename,
  existingNames,
}: {
  pipeline: Pipeline;
  onRename?: (pipelineId: string, newName: string) => void;
  existingNames: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(pipeline.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // 切 pipeline(id) 或 name 從外部變動時 reset draft / 退出編輯模式
  // biome-ignore lint/correctness/useExhaustiveDependencies: pipeline.id forces reset on pipeline switch even if name happens to match
  useEffect(() => {
    setDraft(pipeline.name);
    setEditing(false);
  }, [pipeline.id, pipeline.name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const trimmed = draft.trim();
  const formatOk = /^[a-z0-9][a-z0-9-_]*$/.test(trimmed);
  const taken =
    trimmed !== pipeline.name && existingNames.includes(trimmed);
  const valid = trimmed.length > 0 && formatOk && !taken;
  const lockedByState =
    pipeline.state === "running" || pipeline.state === "stopping";

  function commit() {
    if (!valid || trimmed === pipeline.name) {
      setEditing(false);
      setDraft(pipeline.name);
      return;
    }
    onRename?.(pipeline.id, trimmed);
    setEditing(false);
  }

  if (editing) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input
          ref={inputRef}
          className="mono"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setEditing(false);
              setDraft(pipeline.name);
            }
          }}
          spellCheck={false}
          autoComplete="off"
          style={{
            fontSize: "inherit",
            fontWeight: "inherit",
            padding: "2px 6px",
            border: `1px solid ${valid ? "var(--line)" : "var(--failed)"}`,
            borderRadius: 4,
            background: "var(--panel)",
            color: "var(--fg)",
            minWidth: 200,
          }}
        />
        <button type="button"
          className="btn btn-primary"
          onClick={commit}
          disabled={!valid || trimmed === pipeline.name}
          title={
            taken
              ? "名稱已存在"
              : !formatOk
              ? "只能 a-z / 0-9 / - / _,首字英數"
              : "存"
          }
        >
          ↵
        </button>
        <button type="button"
          className="btn"
          onClick={() => {
            setEditing(false);
            setDraft(pipeline.name);
          }}
        >
          Esc
        </button>
      </span>
    );
  }

  return (
    <h2
      className="focus-title"
      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
    >
      {pipeline.name}
      {onRename && (
        <button type="button"
          className="btn btn-ghost"
          onClick={() => setEditing(true)}
          disabled={lockedByState}
          title={lockedByState ? "running 中不能改名" : "改名"}
          style={{ padding: "2px 6px", fontSize: 12 }}
        >
          ✎
        </button>
      )}
    </h2>
  );
}

export function ReadyBanner({
  pipeline,
  onMerge,
  mergeStrategy,
}: {
  pipeline: Pipeline;
  onMerge?: (id: string) => void;
  mergeStrategy?: string;
}) {
  const confirm = useConfirm();
  const commitCount = pipeline.tickets.reduce(
    (sum, t) => sum + (t.commits?.length ?? 0),
    0
  );
  const baseBranch = pipeline.baseBranch || "main";
  const isMerged = pipeline.state === "merged";
  const failedMerge = pipeline.tickets.find(
    (t) =>
      t.mode === "merge" &&
      (t.status === "failed" ||
        t.status === "failed_iter_limit" ||
        t.status === "failed_transient" ||
        t.status === "paused")
  );

  return (
    <div
      className={
        "banner fade-up " +
        (isMerged ? "banner-ready" : failedMerge ? "banner-paused" : "banner-ready")
      }
    >
      <span
        className="banner-icon"
        style={{
          color: isMerged
            ? "var(--fg-mute)"
            : failedMerge
            ? "var(--failed)"
            : "var(--done)",
        }}
      >
        <CheckCircleIcon />
      </span>
      <div className="banner-body">
        <div className="banner-title">
          {isMerged
            ? `已合併入 ${baseBranch}`
            : failedMerge
            ? `AI 合併失敗 — 點下方重試或先處理 working tree`
            : `所有 ticket 都 ✓ — 可以 AI 合併進 ${baseBranch}`}
        </div>
        <div className="banner-desc mono">
          {pipeline.branch} → {baseBranch} · {commitCount} commit{commitCount === 1 ? "" : "s"}
        </div>
      </div>
      {onMerge && !isMerged && (
        <button type="button"
          className="btn btn-primary"
          onClick={async () => {
            const strategyLabel =
              mergeStrategy === "squash"
                ? "squash(壓成一個 commit)"
                : mergeStrategy === "ff-only"
                ? "ff-only(線性,base 沒前進才行)"
                : "merge --no-ff(保留 ticket commit + 加 merge commit)";
            const isRetry = !!failedMerge;
            const ok = await confirm({
              title: isRetry
                ? `重試 AI 合併 ${pipeline.branch} → ${baseBranch}?`
                : `AI 合併 ${pipeline.branch} → ${baseBranch}?`,
              description:
                `策略:${strategyLabel}\n\n` +
                (isRetry
                  ? `會 reset 失敗的 merge ticket 重跑(prompt 會用最新 strategy 重灌)。\n` +
                    `若是 working tree 髒導致失敗,先 commit / stash 再重試,不然又 FAIL。`
                  : `會 append 一張 merge ticket 進 pipeline 由 runner 派 sub-agent 處理(checkout / merge / 解衝突 / 跑驗證 / commit)。`),
              confirmLabel: isRetry ? "重試合併" : `AI 合併入 ${baseBranch}`,
            });
            if (ok) onMerge(pipeline.id);
          }}
          title={
            failedMerge
              ? "重試 AI 合併"
              : `AI 合併 ${pipeline.branch} into ${baseBranch}`
          }
        >
          <MergeIcon /> {failedMerge ? "重試 AI 合併" : `AI 合併入 ${baseBranch}`}
        </button>
      )}
    </div>
  );
}

function TicketCard({
  ticket,
  tick,
  index,
  onClick,
}: {
  ticket: Ticket;
  tick: number;
  index: number;
  onClick?: () => void;
}) {
  // merge ticket 也跟 iter 一樣有 iter.rounds 結構,渲染走同分支
  const isIter = ticket.mode === "iter" || ticket.mode === "merge";
  const isRunning = ticket.status === "running";
  const isPaused = ticket.status === "paused";
  const isDraft = ticket.status === "draft";

  // runner 不一定寫 totalElapsed,從 rounds[] 推:sum(endedAt - startedAt) / 1000
  const totalElapsed =
    ticket.iter?.totalElapsed ??
    (ticket.iter?.rounds
      ? Math.round(
          ticket.iter.rounds.reduce(
            (sum, r) => sum + Math.max(0, (r.endedAt ?? r.startedAt) - r.startedAt),
            0
          ) / 1000
        )
      : 0);
  const elapsed = isRunning && ticket.iter ? totalElapsed + tick : totalElapsed;
  const iterCurrentLabel = ticket.iter ? Math.max(1, ticket.iter.current) : 0;
  const accent = STATE_COLOR[ticket.status] || "var(--draft)";

  return (
    // ticket card 內含 chips + action button,不能用 <button> wrap(invalid HTML),
    // 改 div + role="button" + onKeyDown 已具備鍵盤可達性
    // biome-ignore lint/a11y/noStaticElementInteractions: clickable card with nested buttons
    <div
      className={"ticket" + (isDraft ? " is-draft" : "") + (isPaused ? " is-paused" : "")}
      style={{ animationDelay: `${index * 40}ms`, cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="ticket-band" style={{ background: accent }} />

      <div className="ticket-row">
        <span className="ticket-num mono">{String(ticket.n).padStart(2, "0")}</span>
        <div className="ticket-title">{ticket.title}</div>

        <span className={"chip ticket-mode" + (isIter ? " is-iter" : "")}>
          {MODE_LABELS[ticket.mode as "step" | "iter"] ?? ticket.mode}
        </span>

        <StatusPill status={ticket.status} />

        {ticket.meta && !isIter && <span className="ticket-meta mono">{ticket.meta}</span>}
      </div>

      {ticket.goal && <div className="ticket-goal">{ticket.goal}</div>}

      {isIter && ticket.iter && (() => {
        const rounds = ticket.iter.rounds ?? [];
        const inProgress =
          (ticket.status === "running" || ticket.status === "paused") &&
          // stage 不是 ✓:那 round 還沒收尾,顯示 in-progress 列
          ticket.iter.stage !== "✓" &&
          ticket.iter.stage !== "done";
        return (
          <>
            {rounds.map((r) => (
              <div key={r.n} className="ticket-iter ticket-iter-row">
                <span className="iter-round-num mono">#{r.n}</span>
                <IterStages
                  stage="✓"
                  status="done"
                  lastVerdict={r.criticVerdict}
                />
                <span className="iter-meta mono">
                  {r.endedAt && r.startedAt
                    ? fmtElapsed(Math.round((r.endedAt - r.startedAt) / 1000))
                    : "—"}
                </span>
              </div>
            ))}
            {inProgress && (
              <div className="ticket-iter ticket-iter-row">
                <span className="iter-round-num mono">
                  #{(ticket.iter.current ?? 0) + 1}
                </span>
                <IterStages
                  stage={ticket.iter.stage}
                  status={ticket.status}
                />
                <span className="iter-meta mono">
                  {fmtElapsed(tick)}
                </span>
              </div>
            )}
            {rounds.length === 0 && !inProgress && (
              // 還沒跑(ready 但 mode=iter 也屬此情形)
              <div className="ticket-iter ticket-iter-row">
                <span className="iter-round-num mono">#1</span>
                <IterStages
                  stage="doer"
                  status={ticket.status}
                />
              </div>
            )}
            <div className="ticket-iter-summary mono">
              iter <strong>{iterCurrentLabel}</strong> · {fmtElapsed(elapsed)} elapsed
            </div>
          </>
        );
      })()}

      {!isIter && (ticket.status === "running" || ticket.status === "paused" ||
                   ticket.status === "done" || ticket.status === "failed" ||
                   ticket.status === "failed_iter_limit" || ticket.status === "failed_transient") && (
        <div className="ticket-iter ticket-iter-row">
          <span className="iter-round-num mono">#1</span>
          <IterStages
            stage={ticket.status === "done" ? "✓" : "doer"}
            status={ticket.status}
            stages={["doer", "✓"]}
            lastVerdict={
              ticket.status === "done"
                ? "PASS"
                : ticket.status.startsWith("failed")
                ? "FAIL"
                : undefined
            }
          />
          {(() => {
            const sa = ticket.startedAt;
            const ea = ticket.endedAt;
            if (!sa) return null;
            const ms = (ea ?? Date.now()) - sa;
            const live = ticket.status === "running" ? tick : 0;
            return (
              <span className="iter-meta mono">
                {fmtElapsed(Math.round(ms / 1000) + live)}
              </span>
            );
          })()}
        </div>
      )}

      {isRunning && ticket.liveLog && (
        <div className="ticket-livelog mono">
          <span className="livelog-cursor blink">▸</span> {ticket.liveLog}
        </div>
      )}

      {isPaused && ticket.reason && (
        <div className="ticket-paused-actions">
          <span className="paused-reason">{ticket.reason}</span>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: TicketStatus }) {
  const c = STATE_COLOR[status];
  const label = STATE_LABEL[status];
  const isLive = status === "running";
  return (
    <span className="status-pill mono" style={{ color: c }}>
      <span className={"status-pill-dot" + (isLive ? " pulse" : "")} style={{ background: c }} />
      {label}
    </span>
  );
}

const STAGE_LABEL: Record<IterStage, string> = {
  doer: "執行",
  critic: "審核",
  "✓": "結果",
  done: "結果",
};

// 顯示 PASS/FAIL/PARTIAL 簡短版,擺在「結果」階段裡
function fmtVerdict(v: unknown): string {
  if (v == null) return "?";
  const k = typeof v === "string" ? v.toUpperCase() : String(v);
  if (k === "PASS" || k === "1") return "PASS";
  if (k === "FAIL" || k === "-1") return "FAIL";
  if (k === "PARTIAL" || k === "0") return "PART";
  return "?";
}

function IterStages({
  stage,
  status,
  stages = ["doer", "critic", "✓"],
  lastVerdict,
}: {
  stage: IterStage;
  status: TicketStatus;
  stages?: IterStage[];
  lastVerdict?: unknown;
}) {
  // runner 可能寫不同字面("executing" / "reviewing" / "done" 等),做同義 normalize
  const raw = String(stage);
  const normalized: IterStage =
    raw === "doer" || raw === "critic" || raw === "✓"
      ? (raw as IterStage)
      : raw === "done" || /done|complete|pass|finish|✓/i.test(raw)
      ? "✓"
      : /crit|review|judge|check/i.test(raw)
      ? "critic"
      : /exec|run|do|work/i.test(raw)
      ? "doer"
      : "doer";
  const idx = stages.indexOf(normalized === "done" ? "✓" : normalized);
  return (
    <div className="iter-stages">
      {stages.map((s, i) => {
        const isPast = i < idx;
        const isCurrent = i === idx;
        const isFuture = i > idx;
        const isResult = s === "✓"; // 結果階段
        // 結果階段的內容:past 用 ✓、current 顯示 verdict(critic 已收尾)、future 用 ?
        let mark: { text: string; cls: string } | null = null;
        if (isPast) {
          mark = { text: "✓", cls: "is-past-mark" };
        } else if (isCurrent) {
          if (isResult) {
            const v = fmtVerdict(lastVerdict);
            mark = { text: v, cls: "is-result-" + v.toLowerCase() };
          } else if (status === "running") {
            mark = { text: "▶", cls: "is-running" };
          } else if (status === "paused") {
            mark = { text: "⏸", cls: "is-paused" };
          }
        } else if (isFuture) {
          mark = { text: "?", cls: "is-future-mark" };
        }
        return (
          <span key={s} style={{ display: "contents" }}>
            <span
              className={
                "iter-stage" +
                (isPast ? " is-past" : "") +
                (isCurrent ? " is-active" : "") +
                (isFuture ? " is-future" : "") +
                (status === "paused" && isCurrent ? " is-paused" : "")
              }
            >
              {STAGE_LABEL[s]}
              {mark && (
                <span className={"iter-stage-mark " + mark.cls} aria-hidden>
                  {mark.text}
                </span>
              )}
            </span>
            {i < stages.length - 1 && <span className="iter-stage-arrow">→</span>}
          </span>
        );
      })}
    </div>
  );
}


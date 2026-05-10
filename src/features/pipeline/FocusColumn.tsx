import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, FolderIcon, MergeIcon, PlusIcon } from "../../ui/icons";
import { STATE_COLOR, STATE_LABEL, fmtElapsed } from "../../data/pipelines";
import type { IterStage, Pipeline, Ticket, TicketStatus } from "../../types/pipeline";
import * as api from "../../api/projects";
import type { RunSummary } from "../../api/projects";

function RunButton({
  pipeline,
  onRun,
  onPause,
  lastRun,
}: {
  pipeline: Pipeline;
  onRun?: (id: string) => void;
  onPause?: (id: string) => void;
  lastRun?: RunSummary | null;
}) {
  const s = pipeline.state;
  const noTickets = pipeline.tickets.length === 0;
  if (s === "running") {
    return (
      <button className="btn" onClick={() => onPause?.(pipeline.id)} title="暫停">
        ⏸ 暫停
      </button>
    );
  }
  if (s === "stopping") {
    return (
      <button className="btn" disabled title="停止中…">
        <span className="qadr-thinking-dots" style={{ display: "inline-flex", verticalAlign: "middle" }}>
          <span /><span /><span />
        </span>{" "}
        停止中
      </button>
    );
  }
  if (s === "ready") {
    return (
      <button className="btn" disabled title="所有 ticket 已完成">
        ✓ 全部完成
      </button>
    );
  }
  // planning / paused / failed → run / continue
  const lastDur = lastRun?.durationMs ? fmtRunDur(lastRun.durationMs) : null;
  const titleBase = noTickets ? "先建一張 ticket" : s === "paused" ? "繼續" : "開始運行";
  const title = lastDur ? `${titleBase}(上次 ${lastDur})` : titleBase;
  return (
    <button
      className="btn btn-primary"
      onClick={() => onRun?.(pipeline.id)}
      disabled={noTickets}
      title={title}
    >
      ▶ {s === "paused" ? "繼續" : "開始運行"}
      {lastDur && (
        <span className="mono" style={{ opacity: 0.7, marginLeft: 6, fontSize: 11 }}>
          ~{lastDur}
        </span>
      )}
    </button>
  );
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
  existingNames = [],
  onTicketClick,
  projectHash,
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
  existingNames?: string[];
  onTicketClick?: (ticket: Ticket) => void;
  projectHash?: string;
}) {
  // Runs summary 給 head chip + RunButton 預估用。pipeline.id / state 變動就 refetch
  // (state 變表示可能新跑完一次)。失敗安靜忽略 — 純資訊性。
  const [runs, setRuns] = useState<RunSummary[]>([]);
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
  const totalCost = runs.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
  const lastRun = runs[0] ?? null;
  const stateColor = STATE_COLOR[pipeline.state];
  const stateLabel = STATE_LABEL[pipeline.state];
  const done = pipeline.tickets.filter((t) => t.status === "done").length;
  const total = pipeline.tickets.length;
  const allDone = done === total && pipeline.state === "ready";
  const hasResettable = pipeline.tickets.some((t) =>
    t.status === "done" ||
    t.status === "failed" ||
    t.status === "failed_iter_limit" ||
    t.status === "failed_transient"
  );
  const lockedByState =
    pipeline.state === "running" || pipeline.state === "stopping";

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

          <button className="btn" onClick={() => onAddTicket?.(pipeline.id)}>
            <PlusIcon /> {hasActiveDraft ? "接續 QA" : "ticket"}
          </button>

          <span style={{ flex: 1 }} />

          <RunButton pipeline={pipeline} onRun={onRun} onPause={onPause} lastRun={lastRun} />
          <OverflowMenu
            pipeline={pipeline}
            hasResettable={hasResettable}
            lockedByState={lockedByState}
            onResetAll={onResetAll}
            onRevealWorktree={onRevealWorktree}
            onDelete={onDelete}
          />
        </div>

        {allDone && <ReadyBanner pipeline={pipeline} />}
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
      <button
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
// 各 action 仍會用 window.confirm 二次確認(刪除 / 重跑全部);reveal 不需要。
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
      <button
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
              onClick={() => {
                setOpen(false);
                const ndone = pipeline.tickets.filter((t) => t.status === "done").length;
                const nfail = pipeline.tickets.filter((t) =>
                  t.status === "failed" ||
                  t.status === "failed_iter_limit" ||
                  t.status === "failed_transient"
                ).length;
                const msg =
                  `重跑全部?會把以下 ticket 狀態回到 draft:\n` +
                  ` · ${ndone} done\n` +
                  ` · ${nfail} failed\n\n` +
                  `清掉 iter rounds / commits 紀錄;worktree 內已 commit 的程式碼留著。\n` +
                  `下次按「開始運行」會把 draft 全跑一遍。`;
                if (window.confirm(msg)) onResetAll(pipeline.id);
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
              onClick={() => {
                setOpen(false);
                const msg =
                  `確定刪除 pipeline "${pipeline.name}"?\n\n` +
                  `pipeline.json 會清掉,但 worktree (~/.vibe-pipeline/worktrees/...) 留著。`;
                if (window.confirm(msg)) onDelete(pipeline.id);
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
    <button
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
        <button
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
        <button
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
        <button
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

export function ReadyBanner({ pipeline }: { pipeline: Pipeline }) {
  const commitCount = pipeline.tickets.reduce(
    (sum, t) => sum + (t.commits?.length ?? 0),
    0
  );
  const baseBranch = pipeline.baseBranch || "main";
  return (
    <div className="banner banner-ready fade-up">
      <span className="banner-icon" style={{ color: "var(--done)" }}>
        <CheckCircleIcon />
      </span>
      <div className="banner-body">
        <div className="banner-title">所有 ticket 都 ✓ — pipeline 可以合併進 {baseBranch}</div>
        <div className="banner-desc mono">
          {pipeline.branch} → {baseBranch} · {commitCount} commit{commitCount === 1 ? "" : "s"}
        </div>
      </div>
      <button className="btn" disabled title="尚未實作">View diff</button>
      <button className="btn btn-primary" disabled title="merge endpoint 尚未實作 (Phase 3+)">
        <MergeIcon /> Merge to {baseBranch}
      </button>
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
  const isIter = ticket.mode === "iter";
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

        <span className={"chip ticket-mode" + (isIter ? " is-iter" : "")}>{ticket.mode}</span>

        <StatusPill status={ticket.status} />

        {ticket.meta && !isIter && <span className="ticket-meta mono">{ticket.meta}</span>}
      </div>

      {isIter && ticket.iter && (
        <div className="ticket-iter">
          <IterStages stage={ticket.iter.stage} status={ticket.status} />
          <Verdicts list={ticket.iter.verdicts} blink={isPaused} />
          <span className="iter-meta mono">
            iter <strong>{iterCurrentLabel}</strong> · {fmtElapsed(elapsed)} elapsed
          </span>
        </div>
      )}

      {isRunning && ticket.liveLog && (
        <div className="ticket-livelog mono">
          <span className="livelog-cursor blink">▸</span> {ticket.liveLog}
        </div>
      )}

      {isPaused && (
        <div className="ticket-paused-actions">
          <span className="paused-reason">{ticket.reason}</span>
          <button className="btn btn-ghost">retry as-is</button>
          <button className="btn btn-primary">介入 →</button>
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
  "✓": "✓",
  done: "✓",
};

function IterStages({ stage, status }: { stage: IterStage; status: TicketStatus }) {
  const stages: IterStage[] = ["doer", "critic", "✓"];
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
      {stages.map((s, i) => (
        <span key={s} style={{ display: "contents" }}>
          <span
            className={
              "iter-stage" +
              (i < idx ? " is-past" : "") +
              (i === idx ? " is-active" : "") +
              (status === "paused" && i === idx ? " is-paused" : "")
            }
          >
            {STAGE_LABEL[s]}
            {status === "paused" && i === idx && " ⏸"}
            {/* pulse 只給「進行中」階段(doer / critic);✓ 是 round 結束 marker,不該脈衝 */}
            {status === "running" && i === idx && s !== "✓" && (
              <span className="iter-stage-pulse pulse" />
            )}
          </span>
          {i < stages.length - 1 && <span className="iter-stage-arrow">→</span>}
        </span>
      ))}
    </div>
  );
}

// 接受兩種格式:
// - 舊 prototype mock 用 1 / 0 / -1 (PASS / WARN / FAIL)
// - runner 寫回字串 "PASS" / "FAIL" / "PARTIAL"
type VerdictItem = 1 | 0 | -1 | string;
function Verdicts({ list, blink }: { list: VerdictItem[]; blink: boolean }) {
  return (
    <span className="verdicts mono">
      <span className="verdicts-label">結果</span>
      {list.map((v, i) => {
        const last = i === list.length - 1;
        const k = typeof v === "string" ? v.toUpperCase() : v;
        const isPass = k === 1 || k === "PASS";
        const isFail = k === -1 || k === "FAIL";
        const cls =
          "verdict-pip " +
          (isPass ? "is-pass" : isFail ? "is-fail" : "is-warn") +
          (last && blink ? " blink" : "");
        return <span key={i} className={cls} />;
      })}
    </span>
  );
}

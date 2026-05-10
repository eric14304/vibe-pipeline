import { CheckCircleIcon, MergeIcon, PlusIcon } from "../../ui/icons";
import { STATE_COLOR, STATE_LABEL, fmtElapsed } from "../../data/pipelines";
import type { IterStage, Pipeline, Ticket, TicketStatus } from "../../types/pipeline";

function RunButton({
  pipeline,
  onRun,
  onPause,
}: {
  pipeline: Pipeline;
  onRun?: (id: string) => void;
  onPause?: (id: string) => void;
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
  return (
    <button
      className="btn btn-primary"
      onClick={() => onRun?.(pipeline.id)}
      disabled={noTickets}
      title={noTickets ? "先建一張 ticket" : s === "paused" ? "繼續" : "開始運行"}
    >
      ▶ {s === "paused" ? "繼續" : "開始運行"}
    </button>
  );
}


export function FocusColumn({
  pipeline,
  tick,
  onAddTicket,
  hasActiveDraft = false,
  onRun,
  onPause,
  onTicketClick,
}: {
  pipeline: Pipeline;
  tick: number;
  onAddTicket?: (pipelineId: string) => void;
  hasActiveDraft?: boolean;
  onRun?: (pipelineId: string) => void;
  onPause?: (pipelineId: string) => void;
  onTicketClick?: (ticket: Ticket) => void;
}) {
  const stateColor = STATE_COLOR[pipeline.state];
  const stateLabel = STATE_LABEL[pipeline.state];
  const done = pipeline.tickets.filter((t) => t.status === "done").length;
  const total = pipeline.tickets.length;
  const allDone = done === total && pipeline.state === "ready";

  return (
    <main className="focus" key={pipeline.id}>
      <div className="focus-head fade-up">
        <div className="focus-head-top">
          <h2 className="focus-title">{pipeline.name}</h2>
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

          <button className="btn" onClick={() => onAddTicket?.(pipeline.id)}>
            <PlusIcon /> {hasActiveDraft ? "接續 QA" : "ticket"}
          </button>

          <span style={{ flex: 1 }} />

          <RunButton pipeline={pipeline} onRun={onRun} onPause={onPause} />
        </div>

        {allDone && <ReadyBanner pipeline={pipeline} />}
      </div>

      <div className="focus-list">
        {pipeline.tickets.map((t, i) => (
          <TicketCard
            key={t.id}
            ticket={t}
            tick={tick}
            index={i}
            onClick={onTicketClick ? () => onTicketClick(t) : undefined}
          />
        ))}
      </div>
    </main>
  );
}

export function ReadyBanner({ pipeline }: { pipeline: Pipeline }) {
  return (
    <div className="banner banner-ready fade-up">
      <span className="banner-icon" style={{ color: "var(--done)" }}>
        <CheckCircleIcon />
      </span>
      <div className="banner-body">
        <div className="banner-title">所有 ticket 都 ✓ — pipeline 可以合併進 main</div>
        <div className="banner-desc mono">{pipeline.branch} → main · 14 commits · +482 −137</div>
      </div>
      <button className="btn">View diff</button>
      <button className="btn btn-primary">
        <MergeIcon /> Merge to main
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

  const totalElapsed = ticket.iter?.totalElapsed ?? 0;
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
            {isRunning && <span className="live-dot pulse" />}
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
            {status === "running" && i === idx && <span className="iter-stage-pulse pulse" />}
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

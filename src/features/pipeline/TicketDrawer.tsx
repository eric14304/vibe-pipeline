import { useEffect, useState } from "react";
import "../../styles/drawer.css";
import "./ticketDrawer.css";
import type { Ticket, IterRound, CommitRef } from "../../types/pipeline";
import { MODE_LABELS } from "../../api/qa";
import { STATE_COLOR } from "../../data/pipelines";
import { RunHistory } from "./RunHistory";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  ready: "待跑",
  running: "執行中",
  paused: "暫停",
  done: "完成",
  failed: "失敗",
  failed_iter_limit: "達 iter 上限",
  failed_transient: "暫時錯誤",
};

export function TicketDrawer({
  ticket,
  pipelineName,
  pipelineBranch,
  pipelineId,
  projectHash,
  onClose,
  onResetTicket,
}: {
  ticket: Ticket;
  pipelineName: string;
  pipelineBranch: string;
  pipelineId: string;
  projectHash: string;
  onClose: () => void;
  onResetTicket?: (ticketId: string) => Promise<void> | void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const accent = STATE_COLOR[ticket.status] || "var(--fg-mute)";
  const statusLabel = STATUS_LABEL[ticket.status] || ticket.status;
  const modeLabel = MODE_LABELS[ticket.mode as "step" | "iter"] ?? ticket.mode;
  const spec = ticket as unknown as {
    goal?: string;
    acceptance?: string[];
    prompt?: string;
    iterLimit?: number;
    iterStopAtLimit?: boolean;
  };

  return (
    <div className="drawer-stage tdrw-stage">
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer tdrw-drawer">
        <div className="drawer-head">
          <div className="drawer-crumb">
            <span className="mono">{pipelineName}</span>
            <span className="sep">/</span>
            <span className="mono" style={{ color: "var(--fg-mute)" }}>
              ⎇ {pipelineBranch}
            </span>
            <span className="drawer-crumb-spacer" />
            <button
              className="create-x"
              onClick={onClose}
              title="關閉 (Esc)"
              aria-label="關閉"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="drawer-titlerow">
            <span className="tdrw-num mono">{String(ticket.n).padStart(2, "0")}</span>
            <div className="drawer-title">{ticket.title}</div>
          </div>
          <div className="drawer-meta mono">
            <span
              className="tdrw-status-chip"
              style={{
                color: accent,
                background: `color-mix(in srgb, ${accent} 14%, transparent)`,
                borderColor: "transparent",
              }}
            >
              <span className="dot" style={{ background: accent }} />
              {statusLabel}
            </span>
            <span className="sep">·</span>
            <span>{modeLabel}</span>
            {ticket.mode === "iter" && spec.iterLimit != null && (
              <>
                <span className="sep">·</span>
                <span>上限 {spec.iterLimit} 輪</span>
              </>
            )}
          </div>
        </div>

        <div className="drawer-body tdrw-body">
          <Section label="goal">
            <ReadOnlyValue value={spec.goal} />
          </Section>
          <Section label="acceptance">
            {Array.isArray(spec.acceptance) && spec.acceptance.length > 0 ? (
              <ul className="tdrw-list">
                {spec.acceptance.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            ) : (
              <ReadOnlyValue value={undefined} />
            )}
          </Section>
          <Section label="prompt">
            <pre className="tdrw-prompt">{spec.prompt || "(空)"}</pre>
          </Section>
          {ticket.iter && (
            <Section label="iter 概況">
              <div className="mono" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
                iter {ticket.iter.current} · {ticket.iter.verdicts.length} verdict
              </div>
            </Section>
          )}
          {ticket.iter?.rounds && ticket.iter.rounds.length > 0 && (
            <Section label="iter 輪次明細">
              <IterRounds rounds={ticket.iter.rounds} />
            </Section>
          )}
          {ticket.commits && ticket.commits.length > 0 && (
            <Section label="commits">
              <Commits commits={ticket.commits} />
            </Section>
          )}
          {ticket.liveLog && (
            <Section label="liveLog">
              <pre className="tdrw-prompt">{ticket.liveLog}</pre>
            </Section>
          )}
          {ticket.reason && (
            <Section label="reason">
              <ReadOnlyValue value={ticket.reason} />
            </Section>
          )}
          <Section label="pipeline 執行紀錄">
            <RunHistory projectHash={projectHash} pipelineId={pipelineId} />
          </Section>
          {onResetTicket && isTerminalStatus(ticket.status) && (
            <Section label="操作">
              <button
                className="btn btn-ghost"
                onClick={() => {
                  const msg =
                    `重置 ticket "${ticket.title}" 狀態到 draft?\n\n` +
                    `會清掉:iter rounds / verdicts / commits 紀錄;但 worktree 內已 commit 的程式碼會留著。\n` +
                    `下次執行 pipeline 會重新跑這張(可能再產生新 commit)。`;
                  if (window.confirm(msg)) onResetTicket(ticket.id);
                }}
              >
                ↺ 重置 ticket 狀態(可重跑)
              </button>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function isTerminalStatus(s: string): boolean {
  return s === "done" || s === "failed" || s === "failed_iter_limit" || s === "failed_transient";
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="tdrw-section">
      <div className="tdrw-section-label mono">{label}</div>
      <div className="tdrw-section-body">{children}</div>
    </div>
  );
}

function ReadOnlyValue({ value }: { value: string | undefined }) {
  if (!value) return <span className="tdrw-empty">(空)</span>;
  return <div className="tdrw-text">{value}</div>;
}

function IterRounds({ rounds }: { rounds: IterRound[] }) {
  return (
    <div className="tdrw-iter-rounds">
      {rounds.map((r) => {
        const v = String(r.criticVerdict ?? "").toUpperCase();
        const cls =
          v === "PASS"
            ? "is-pass"
            : v === "FAIL"
            ? "is-fail"
            : "is-partial";
        const dur =
          r.endedAt && r.startedAt
            ? fmtDur(r.endedAt - r.startedAt)
            : "—";
        return (
          <div key={r.n} className="tdrw-iter-round">
            <div className="tdrw-iter-round-head">
              <span className="mono tdrw-iter-round-n">#{r.n}</span>
              <span className={"tdrw-iter-verdict " + cls}>{r.criticVerdict}</span>
              <span className="mono tdrw-iter-round-dur">{dur}</span>
            </div>
            {r.executorSummary && (
              <div className="tdrw-iter-round-block">
                <div className="tdrw-iter-round-label">執行AI 摘要</div>
                <div className="tdrw-text">{r.executorSummary}</div>
              </div>
            )}
            {r.criticFeedback && (
              <div className="tdrw-iter-round-block">
                <div className="tdrw-iter-round-label">審核 feedback</div>
                <div className="tdrw-text">{r.criticFeedback}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Commits({ commits }: { commits: CommitRef[] }) {
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  useEffect(() => {
    if (!copiedHash) return;
    const t = setTimeout(() => setCopiedHash(null), 1400);
    return () => clearTimeout(t);
  }, [copiedHash]);

  async function copy(hash: string) {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(hash);
    } catch {
      // 部分環境(non-https / older browsers)沒 clipboard API,fallback 暴力 select
      const ta = document.createElement("textarea");
      ta.value = hash;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopiedHash(hash); } catch {}
      document.body.removeChild(ta);
    }
  }

  return (
    <div className="tdrw-commits">
      {commits.map((c) => (
        <div key={c.hash} className="tdrw-commit">
          <button
            className="mono tdrw-commit-hash tdrw-commit-hash-btn"
            title={copiedHash === c.hash ? "已複製!" : `點擊複製完整 hash\n${c.hash}`}
            onClick={() => copy(c.hash)}
          >
            {copiedHash === c.hash ? "已複製" : c.hash.slice(0, 7)}
          </button>
          <span className="tdrw-commit-subject">{c.subject}</span>
          <span className="mono tdrw-commit-ts">{fmtTimeShort(c.ts)}</span>
        </div>
      ))}
    </div>
  );
}

function fmtDur(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function fmtTimeShort(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

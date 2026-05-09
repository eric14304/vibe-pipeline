import { useEffect } from "react";
import "../../styles/drawer.css";
import "./ticketDrawer.css";
import type { Ticket } from "../../types/pipeline";
import { MODE_LABELS } from "../../api/qa";
import { STATE_COLOR } from "../../data/pipelines";

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
  onClose,
}: {
  ticket: Ticket;
  pipelineName: string;
  pipelineBranch: string;
  onClose: () => void;
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
            <Section label="執行紀錄">
              <div className="mono" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
                iter {ticket.iter.current} · {ticket.iter.verdicts.length} verdict
              </div>
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
        </div>
      </div>
    </div>
  );
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

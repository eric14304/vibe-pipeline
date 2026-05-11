import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import "../../styles/drawer.css";
import "./ticketDrawer.css";
import type { Ticket, IterRound, CommitRef } from "../../types/pipeline";
import { MODE_LABELS } from "../../api/qa";
import { STATE_COLOR, fmtDuration, normalizeVerdict } from "../../data/pipelines";
import { useConfirm } from "../../ui/ConfirmDialog";
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
  isSplitting = false,
  onClose,
  onResetTicket,
  onSplitTicket,
  onDeleteTicket,
  onToggleMode,
  onChangeIterLimit,
}: {
  ticket: Ticket;
  pipelineName: string;
  pipelineBranch: string;
  pipelineId: string;
  projectHash: string;
  isSplitting?: boolean;
  onClose: () => void;
  onResetTicket?: (ticketId: string) => Promise<void> | void;
  onSplitTicket?: (ticketId: string) => Promise<void> | void;
  onDeleteTicket?: (ticketId: string) => Promise<void> | void;
  onToggleMode?: (ticketId: string, nextMode: "step" | "iter") => Promise<void> | void;
  onChangeIterLimit?: (ticketId: string, limit: number) => Promise<void> | void;
}) {
  const confirm = useConfirm();
  // inline split confirm:點 ✂ AI 拆分 後不跳 popup,actions 區塊就地展開成 inline 確認卡
  const [splitPending, setSplitPending] = useState(false);
  // isSplitting true → 強制收起 pending UI(已經在跑了)
  useEffect(() => {
    if (isSplitting) setSplitPending(false);
  }, [isSplitting]);
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
      <button
        type="button"
        className="drawer-scrim"
        onClick={onClose}
        aria-label="關閉"
      />
      <div className="drawer tdrw-drawer">
        <div className="drawer-head">
          <div className="drawer-crumb">
            <span className="mono">{pipelineName}</span>
            <span className="sep">/</span>
            <span className="mono" style={{ color: "var(--fg-mute)" }}>
              ⎇ {pipelineBranch}
            </span>
            <span className="drawer-crumb-spacer" />
            <button type="button"
              className="create-x"
              onClick={onClose}
              title="關閉 (Esc)"
              aria-label="關閉"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
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
            {(() => {
              const canToggle =
                onToggleMode && (ticket.mode === "step" || ticket.mode === "iter") && isModeToggleable(ticket);
              const next: "step" | "iter" = ticket.mode === "iter" ? "step" : "iter";
              const className =
                "chip ticket-mode" +
                (ticket.mode === "iter" ? " is-iter" : "") +
                (canToggle ? " is-toggle" : "");
              const label = canToggle ? `${modeLabel} ⇄` : modeLabel;
              const title = canToggle
                ? `點擊切換為 ${next === "iter" ? "迭代任務" : "單次任務"}`
                : ticket.mode === "merge" || ticket.mode === "sync"
                ? "synthetic ticket 不可切 mode"
                : "ticket 已跑過 / 在跑,不可切 mode";
              if (canToggle) {
                return (
                  <button
                    type="button"
                    className={className}
                    onClick={() => onToggleMode?.(ticket.id, next)}
                    title={title}
                    style={{ cursor: "pointer" }}
                  >
                    {label}
                  </button>
                );
              }
              return (
                <span className={className} title={title}>
                  {modeLabel}
                </span>
              );
            })()}
            {ticket.mode === "iter" && (
              <IterLimitField
                ticket={ticket}
                value={spec.iterLimit ?? 5}
                onChange={onChangeIterLimit}
              />
            )}
          </div>
          {(onResetTicket || onSplitTicket || onDeleteTicket) &&
            (isTerminalStatus(ticket.status) || isSplittable(ticket) || isDeletable(ticket)) && (
              isSplitting ? (
                <div className="tdrw-actions tdrw-actions-running">
                  <span className="tdrw-spinner" aria-hidden />
                  <span className="tdrw-running-label">🤖 AI 拆分中…(~10-30s)</span>
                </div>
              ) : splitPending && onSplitTicket && isSplittable(ticket) ? (
                <div className="tdrw-split-confirm">
                  <div className="tdrw-split-confirm-title">
                    用 AI 把 “{ticket.title}” 拆成多張獨立 ticket?
                  </div>
                  <div className="tdrw-split-confirm-desc">
                    AI 會分析這張 ticket 的 prompt / acceptance,拆成 N 張各自可獨立執行的 ticket。
                    原本這張會被取代(N=1 時 AI 認為不需拆,不動)。預估花 ~$0.05-0.20 一次 claude session。
                  </div>
                  <div className="tdrw-split-confirm-actions">
                    <button type="button" className="tdrw-action" onClick={() => setSplitPending(false)}>
                      取消
                    </button>
                    <button type="button" className="tdrw-action tdrw-action-primary"
                      onClick={() => {
                        setSplitPending(false);
                        onSplitTicket(ticket.id);
                      }}
                    >
                      ✂ 確認 AI 拆分
                    </button>
                  </div>
                </div>
              ) : (
                <div className="tdrw-actions">
                  {onResetTicket && isTerminalStatus(ticket.status) && (
                    <button type="button"
                      className="tdrw-action"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `重置 ticket "${ticket.title}" 狀態到 draft?`,
                          description:
                            `會清掉:iter rounds / verdicts / commits 紀錄;但 worktree 內已 commit 的程式碼會留著。\n` +
                            `下次執行 pipeline 會重新跑這張(可能再產生新 commit)。`,
                          confirmLabel: "重置",
                          danger: true,
                        });
                        if (ok) onResetTicket(ticket.id);
                      }}
                    >
                      ↺ 重置
                    </button>
                  )}
                  {onSplitTicket && isSplittable(ticket) && (
                    <button type="button"
                      className="tdrw-action"
                      onClick={() => setSplitPending(true)}
                    >
                      ✂ AI 拆分
                    </button>
                  )}
                  {onDeleteTicket && isDeletable(ticket) && (
                    <button type="button"
                      className="tdrw-action tdrw-action-danger"
                      onClick={async () => {
                        const ok = await confirm({
                          title: `刪除 ticket "${ticket.title}"?`,
                          description:
                            "刪掉這張 ticket(後續 pipeline 不會再跑這張)。\n" +
                            "worktree 上已 commit 的程式碼留著(這只是 spec 紀錄消失)。",
                          confirmLabel: "刪除",
                          danger: true,
                        });
                        if (ok) onDeleteTicket(ticket.id);
                      }}
                    >
                      🗑 刪除
                    </button>
                  )}
                </div>
              )
            )}
        </div>

        <div className="drawer-body tdrw-body">
          <Section label="goal">
            <ReadOnlyValue value={spec.goal} />
          </Section>
          <Section label="acceptance">
            {Array.isArray(spec.acceptance) && spec.acceptance.length > 0 ? (
              <ul className="tdrw-list">
                {spec.acceptance.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            ) : (
              <ReadOnlyValue value={undefined} />
            )}
          </Section>
          <Section label="prompt">
            {spec.prompt ? (
              <div className="tdrw-prompt-md">
                <ReactMarkdown>{spec.prompt}</ReactMarkdown>
              </div>
            ) : (
              <span className="tdrw-empty">(空)</span>
            )}
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
        </div>
      </div>
    </div>
  );
}

// 迭代上限欄位:draft / ready 狀態的 iter ticket 顯 number input,點 ▲▼ / 直接打字改;
// 失焦或 Enter 才送(避免每按一下都打 API)。其他狀態 read-only 顯「上限 N 輪」。
function IterLimitField({
  ticket,
  value,
  onChange,
}: {
  ticket: Ticket;
  value: number;
  onChange?: (ticketId: string, limit: number) => Promise<void> | void;
}) {
  const editable =
    !!onChange &&
    ticket.mode === "iter" &&
    (ticket.status === "draft" || ticket.status === "ready");
  const [draft, setDraft] = useState(String(value));
  // ticket value 從外部變化(別人改 / refetch)→ 同步進來
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  if (!editable) {
    return <span>上限 {value} 輪</span>;
  }
  function commit() {
    const n = Math.max(1, Math.min(5, Math.floor(Number(draft) || value)));
    setDraft(String(n));
    if (n !== value) onChange?.(ticket.id, n);
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ color: "var(--fg-mute)" }}>上限</span>
      <input
        type="number"
        min={1}
        max={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        title="迭代上限輪數 (1-5),Enter 送 / Esc 還原"
        className="tdrw-iter-limit"
      />
      <span style={{ color: "var(--fg-mute)" }}>輪</span>
    </span>
  );
}

function isTerminalStatus(s: string): boolean {
  return s === "done" || s === "failed" || s === "failed_iter_limit" || s === "failed_transient";
}

// 只 draft / ready 可切 mode(step ↔ iter);跑過後切 mode 影響已產生的 iter rounds 顯示語意
function isModeToggleable(t: Ticket): boolean {
  if (t.mode !== "step" && t.mode !== "iter") return false; // synthetic 不切
  return t.status === "draft" || t.status === "ready";
}

// 只 draft / ready 可拆;running 中拆會撞 runner;done / failed 拆完也派不出去(已跑過)
function isSplittable(t: Ticket): boolean {
  if (t.mode === "merge" || t.mode === "sync") return false; // synthetic 不可拆
  return t.status === "draft" || t.status === "ready";
}

// running 不可刪(撞 runner);synthetic 系統管的不可刪;其他 (draft/ready/paused/done/failed_*) 都可
function isDeletable(t: Ticket): boolean {
  if (t.mode === "merge" || t.mode === "sync") return false;
  return t.status !== "running";
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
        const n = normalizeVerdict(r.criticVerdict);
        const cls =
          n === "PASS"
            ? "is-pass"
            : n === "FAIL"
            ? "is-fail"
            : "is-partial";
        const dur =
          r.endedAt && r.startedAt
            ? fmtDuration(r.endedAt - r.startedAt)
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
          <button type="button"
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

function fmtTimeShort(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

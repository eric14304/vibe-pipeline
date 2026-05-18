import { useEffect, useState } from "react";
import * as api from "../../api/projects";
import type { RunSummary, RunDetail } from "../../api/projects";
import { fmtDuration } from "../../data/pipelines";

export function RunHistory({
  projectHash,
  pipelineId,
}: {
  projectHash: string;
  pipelineId: string;
}) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listPipelineRuns(projectHash, pipelineId)
      .then((arr) => {
        if (cancelled) return;
        setRuns(arr);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectHash, pipelineId]);

  useEffect(() => {
    if (!openFile) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    api
      .getPipelineRun(projectHash, pipelineId, openFile)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
      })
      .catch(() => {
        if (cancelled) return;
        setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [openFile, projectHash, pipelineId]);

  if (error) {
    return <div className="tdrw-empty">讀取執行紀錄失敗: {error}</div>;
  }
  if (runs === null) {
    return <div className="tdrw-empty">載入中…</div>;
  }
  if (runs.length === 0) {
    return <div className="tdrw-empty">尚未執行過</div>;
  }

  return (
    <div className="tdrw-runs">
      {runs.map((r) => (
        <RunCard
          key={r.filename}
          run={r}
          open={openFile === r.filename}
          detail={openFile === r.filename ? detail : null}
          detailLoading={openFile === r.filename && detailLoading}
          onToggle={() =>
            setOpenFile((cur) => (cur === r.filename ? null : r.filename))
          }
        />
      ))}
    </div>
  );
}

function RunCard({
  run,
  open,
  detail,
  detailLoading,
  onToggle,
}: {
  run: RunSummary;
  open: boolean;
  detail: RunDetail | null;
  detailLoading: boolean;
  onToggle: () => void;
}) {
  const ok = run.exitCode === 0;
  const cost = run.costUsd != null ? `$${run.costUsd.toFixed(2)}` : "—";
  const dur = run.durationMs != null ? fmtDuration(run.durationMs) : "—";
  const turns = run.numTurns != null ? `${run.numTurns} turns` : "—";
  const tokens = run.tokens
    ? `in ${fmtNum(run.tokens.input)} · out ${fmtNum(run.tokens.output)} · cache ${fmtNum(
        run.tokens.cacheRead
      )}${
        run.tokens.reasoning != null && run.tokens.reasoning > 0
          ? ` · reason ${fmtNum(run.tokens.reasoning)}`
          : ""
      }`
    : "—";
  // codex 沒成本 / 回合 / Tokens 資料(全 null 或語意空),隱藏這三欄避免「—」滿版
  const isCodex = run.provider === "codex";
  const ticketDiff = computeTicketDiff(run.ticketsBefore, run.ticketsAfter);
  return (
    <div className="tdrw-run-card">
      <button type="button"
        className="tdrw-run-head"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? "收合" : "展開"}
      >
        <span className="tdrw-run-head-chev">{open ? "▾" : "▸"}</span>
        <div className="tdrw-run-head-title">
          <span className="mono">{fmtTime(run.startedAt)}</span>
          <span className={"tdrw-run-status " + (ok ? "is-ok" : "is-fail")}>
            exit {run.exitCode ?? "?"}
          </span>
          <span className="tdrw-run-status" title="provider · model">
            {run.provider || run.model
              ? `${run.provider ?? "—"} · ${run.model ?? "—"}`
              : "—"}
          </span>
          {run.result && (
            <span className="tdrw-run-result" title={run.result}>
              {run.result}
            </span>
          )}
        </div>
        <span />
      </button>
      <div className="tdrw-run-meta">
        <span className="tdrw-run-meta-item">
          <span className="tdrw-run-meta-label">時間</span>
          <strong>{dur}</strong>
        </span>
        {!isCodex && (
          <>
            <span className="tdrw-run-meta-item">
              <span className="tdrw-run-meta-label">成本</span>
              <strong>{cost}</strong>
            </span>
            <span className="tdrw-run-meta-item">
              <span className="tdrw-run-meta-label">回合</span>
              <strong>{turns}</strong>
            </span>
            <span className="tdrw-run-meta-item">
              <span className="tdrw-run-meta-label">Tokens</span>
              <strong>{tokens}</strong>
            </span>
          </>
        )}
        {run.failureReason && (
          <span className="tdrw-run-meta-item" title={run.failureReason}>
            <span className="tdrw-run-meta-label">失敗原因</span>
            <strong>{run.failureReason}</strong>
          </span>
        )}
        {ticketDiff.length > 0 && (
          <span className="tdrw-run-meta-item">
            <span className="tdrw-run-meta-label">Ticket 進度</span>
            <strong>
              {ticketDiff.map((d, i) => (
                <span key={d.id}>
                  {i > 0 ? " / " : ""}
                  {d.id}: {d.from}→{d.to}
                </span>
              ))}
            </strong>
          </span>
        )}
      </div>

      {open && (
        <div className="tdrw-run-detail">
          {detailLoading && <div className="tdrw-empty">載入中…</div>}
          {detail && !detailLoading && (
            <>
              {detail.result && (
                <>
                  <div className="tdrw-run-detail-label">result</div>
                  <div className="tdrw-text">{detail.result}</div>
                </>
              )}
              {detail.sessionId && (
                <>
                  <div className="tdrw-run-detail-label">session id</div>
                  <pre className="tdrw-run-pre">{detail.sessionId}</pre>
                </>
              )}
              <div className="tdrw-run-detail-label">stdout (raw)</div>
              <pre className="tdrw-run-pre">{detail.stdout || "(empty)"}</pre>
              {detail.stderr && (
                <>
                  <div className="tdrw-run-detail-label">stderr</div>
                  <pre className="tdrw-run-pre">{detail.stderr}</pre>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// 比對 spawn 前 / exit 後 ticket 狀態,只列有差的;沒 snapshot 回空陣列
function computeTicketDiff(
  before: RunSummary["ticketsBefore"],
  after: RunSummary["ticketsAfter"],
): Array<{ id: string; from: string; to: string }> {
  if (!before || !after) return [];
  const beforeMap = new Map(before.map((t) => [t.id, t.status]));
  const out: Array<{ id: string; from: string; to: string }> = [];
  for (const t of after) {
    const from = beforeMap.get(t.id) ?? "(新)";
    if (from !== t.status) out.push({ id: t.id, from, to: t.status });
  }
  return out;
}

function fmtNum(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

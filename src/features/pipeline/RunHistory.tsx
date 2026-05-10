import { useEffect, useState } from "react";
import * as api from "../../api/projects";
import type { RunSummary, RunDetail } from "../../api/projects";

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
      )}`
    : "—";
  return (
    <div className="tdrw-run-card">
      <button
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
          <span>⏱</span>
          <strong>{dur}</strong>
        </span>
        <span className="tdrw-run-meta-item">
          <span>$</span>
          <strong>{cost}</strong>
        </span>
        <span className="tdrw-run-meta-item">
          <span>↺</span>
          <strong>{turns}</strong>
        </span>
        <span className="tdrw-run-meta-item">{tokens}</span>
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

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
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

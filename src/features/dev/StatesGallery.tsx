// Dev-only states gallery:一頁掃完所有 (PipelineState × condition) → button/banner 渲染。
// 加新 state 或改 button 邏輯後直接到 /dev/states 視覺驗收,不用一個一個跑 e2e。
import { RunButton, ReadyBanner } from "../pipeline/FocusColumn";
import type { Pipeline, PipelineState, TicketStatus } from "../../types/pipeline";

function makePipeline(opts: {
  state: PipelineState;
  noTickets?: boolean;
  hasResettable?: boolean;
  ticketStatus?: TicketStatus;
}): Pipeline {
  const tickets = opts.noTickets
    ? []
    : [
        {
          id: "t1",
          n: 1,
          title: "範例 ticket",
          mode: "step" as const,
          status: opts.ticketStatus ?? "draft",
        },
      ];
  return {
    id: "demo",
    name: "demo",
    branch: "pipeline/demo",
    baseBranch: "main",
    state: opts.state,
    tickets,
  };
}

const RUN_BUTTON_CASES: Array<{
  label: string;
  pipeline: Pipeline;
  lastRun?: { durationMs: number } | null;
}> = [
  { label: "planning + 0 tickets", pipeline: makePipeline({ state: "planning", noTickets: true }) },
  { label: "planning + 1 draft", pipeline: makePipeline({ state: "planning", ticketStatus: "draft" }) },
  {
    label: "planning + 上次 3m",
    pipeline: makePipeline({ state: "planning", ticketStatus: "draft" }),
    lastRun: { durationMs: 180000 },
  },
  { label: "running", pipeline: makePipeline({ state: "running", ticketStatus: "running" }) },
  { label: "paused", pipeline: makePipeline({ state: "paused", ticketStatus: "draft" }) },
  { label: "paused + 0 tickets", pipeline: makePipeline({ state: "paused", noTickets: true }) },
  { label: "ready (all done)", pipeline: makePipeline({ state: "ready", ticketStatus: "done" }) },
  { label: "failed", pipeline: makePipeline({ state: "failed", ticketStatus: "failed" }) },
  { label: "merged", pipeline: makePipeline({ state: "merged", ticketStatus: "done" }) },
];

const READY_BANNER_CASES: Array<{ label: string; pipeline: Pipeline }> = [
  { label: "ready 1 commit", pipeline: { ...makePipeline({ state: "ready", ticketStatus: "done" }), tickets: [{ id: "t1", n: 1, title: "x", mode: "step", status: "done", commits: [{ hash: "abc1234", subject: "ticket(1): demo", ts: Date.now() }] }] } },
  { label: "ready no commits", pipeline: makePipeline({ state: "ready", ticketStatus: "done" }) },
  { label: "ready 3 tickets / 3 commits", pipeline: { ...makePipeline({ state: "ready" }), tickets: [
    { id: "t1", n: 1, title: "a", mode: "step", status: "done", commits: [{ hash: "aaa1111", subject: "ticket(1)", ts: Date.now() }] },
    { id: "t2", n: 2, title: "b", mode: "step", status: "done", commits: [{ hash: "bbb2222", subject: "ticket(2)", ts: Date.now() }] },
    { id: "t3", n: 3, title: "c", mode: "step", status: "done", commits: [{ hash: "ccc3333", subject: "ticket(3)", ts: Date.now() }] },
  ] } },
];

export function StatesGallery() {
  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ marginBottom: 8 }}>狀態決策 Gallery</h1>
      <p style={{ color: "var(--fg-mute)", marginBottom: 24 }}>
        所有 (state × condition) → button/banner 應該長什麼樣子。改邏輯後過來一眼掃完。
      </p>

      <h2 style={{ marginTop: 24, marginBottom: 12 }}>RunButton</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {RUN_BUTTON_CASES.map((c) => (
          <div key={c.label} style={{
            border: "1px solid var(--line)",
            borderRadius: 6,
            padding: 12,
            background: "var(--panel)",
          }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-faint)", marginBottom: 8 }}>
              {c.label}
            </div>
            <RunButton pipeline={c.pipeline} lastRun={c.lastRun ? { ...c.lastRun, filename: "x", logPath: "x", startedAt: 0, exitCode: 0, costUsd: 0, numTurns: 0, result: null, tokens: null, sessionId: null, hasStderr: false } : null} />
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>ReadyBanner(allDone state=ready 才會 render)</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {READY_BANNER_CASES.map((c) => (
          <div key={c.label}>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-faint)", marginBottom: 8 }}>
              {c.label}
            </div>
            <ReadyBanner pipeline={c.pipeline} />
          </div>
        ))}
      </div>
    </div>
  );
}

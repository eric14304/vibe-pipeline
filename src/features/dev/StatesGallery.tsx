// Dev-only states gallery:一頁掃完所有 (PipelineState × condition) → button/banner 渲染。
// 加新 state 或改 button 邏輯後直接到 /dev/states 視覺驗收,不用一個一個跑 e2e。
import { RunButton, ReadyBanner, TicketCard } from "../pipeline/FocusColumn";
import type { Pipeline, PipelineState, Ticket, TicketStatus } from "../../types/pipeline";

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

// TicketCard 視覺案例:重點驗證 mode=iter / status=ready 但 backend 已預建空 iter 物件時,
// FocusColumn 不能把它當「執行中」渲染(B5 bug)。
const TICKET_CARD_CASES: Array<{ label: string; ticket: Ticket }> = [
  {
    label: "iter + ready + 預建空 iter (rounds=[])",
    ticket: {
      id: "tc1",
      n: 1,
      title: "ready iter ticket (預建空 iter)",
      goal: "驗證 ready iter 不顯示 stage chip / iter row",
      mode: "iter",
      status: "ready",
      iter: { current: 0, stage: "doer", verdicts: [], rounds: [] },
    },
  },
  {
    label: "iter + draft (沒 iter 物件)",
    ticket: {
      id: "tc2",
      n: 2,
      title: "draft iter ticket",
      mode: "iter",
      status: "draft",
    },
  },
  {
    label: "iter + running + 1 完成 round",
    ticket: {
      id: "tc3",
      n: 3,
      title: "running iter ticket",
      mode: "iter",
      status: "running",
      startedAt: Date.now() - 120000,
      iter: {
        current: 2,
        stage: "critic",
        verdicts: ["FAIL"],
        rounds: [
          { n: 1, startedAt: Date.now() - 120000, endedAt: Date.now() - 60000, criticVerdict: "FAIL" },
          { n: 2, startedAt: Date.now() - 60000, criticVerdict: "FAIL" },
        ],
      },
    },
  },
  {
    label: "iter + done",
    ticket: {
      id: "tc4",
      n: 4,
      title: "done iter ticket",
      mode: "iter",
      status: "done",
      startedAt: Date.now() - 300000,
      endedAt: Date.now() - 60000,
      iter: {
        current: 1,
        stage: "✓",
        verdicts: ["PASS"],
        rounds: [
          { n: 1, startedAt: Date.now() - 300000, endedAt: Date.now() - 60000, criticVerdict: "PASS" },
        ],
      },
    },
  },
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
            <RunButton pipeline={c.pipeline} lastRun={c.lastRun ? { ...c.lastRun, filename: "x", logPath: "x", startedAt: 0, exitCode: 0, costUsd: 0, numTurns: 0, result: null, tokens: null, sessionId: null, hasStderr: false, provider: null, model: null, failureReason: null, ticketsBefore: null, ticketsAfter: null } : null} />
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

      <h2 style={{ marginTop: 32, marginBottom: 12 }}>TicketCard(iter row / stage chip 條件)</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {TICKET_CARD_CASES.map((c, i) => (
          <div key={c.label}>
            <div className="mono" style={{ fontSize: 11, color: "var(--fg-faint)", marginBottom: 8 }}>
              {c.label}
            </div>
            <TicketCard ticket={c.ticket} tick={0} index={i} />
          </div>
        ))}
      </div>
    </div>
  );
}

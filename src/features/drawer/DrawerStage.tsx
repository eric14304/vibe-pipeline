import { useEffect, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import "../../styles/drawer.css";
import { BoardScreen } from "../pipeline/BoardScreen";

export type DrawerState = "step-running" | "step-done" | "iter-running" | "iter-done";

type Verdict = "pass" | "reject" | "partial" | "running";
type StreamLine = { kind: "h" | "p" | "li" | "code"; text: string };

function DCaret({ open }: { open: boolean }) {
  return (
    <span className="caret" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
    </span>);

}

function DSection({ label, summary, aside, children, defaultOpen = true }: {
  label: ReactNode;
  summary?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={"dsec" + (open ? " is-open" : "")}>
      <div className="dsec-head" onClick={() => setOpen((o) => !o)}>
        <DCaret open={open} />
        <span className="dsec-label">{label}</span>
        {!open && summary && <span className="dsec-summary">{summary}</span>}
        {aside && <span className="dsec-aside">{aside}</span>}
      </div>
      {open && <div className="dsec-body">{children}</div>}
    </div>);

}

function StatusChip({ status, style }: { status: "done" | "running" | "paused" | "idle"; style?: CSSProperties }) {
  const map = {
    done: { cls: "statechip-done", color: "var(--done)", label: "done" },
    running: { cls: "statechip-running", color: "var(--running)", label: "running" },
    paused: { cls: "statechip-paused", color: "var(--paused)", label: "paused" },
    idle: { cls: "statechip-step", color: "var(--fg-mute)", label: "idle" }
  } as const;
  const m = map[status] || map.idle;
  return (
    <span className={"statechip " + m.cls} style={style}>
      {status === "running" ?
      <span className="pulse" style={{ width: 6, height: 6, borderRadius: 3, background: m.color }} /> :
      <span className="dot" style={{ background: m.color }} />}
      {m.label}
    </span>);

}

function ModeChip({ mode }: { mode: "iter" | "step" }) {
  const isIter = mode === "iter";
  return (
    <span className={"statechip " + (isIter ? "statechip-iter" : "statechip-step")}>
      {mode}
    </span>);

}

function CloseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>;
}
function FileIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>;
}
function OpenIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17 17 7M9 7h8v8" /></svg>;
}

function FileRow({ path, meta }: { path: string; meta: string }) {
  return (
    <div className="file-row">
      <span className="icon"><FileIcon /></span>
      <span className="path">{path}</span>
      <span className="meta">{meta}</span>
      <span className="open"><OpenIcon /></span>
    </div>);

}

function IterRow({ n, verdict, reason, dur, doer, current, stalled }: {
  n: number;
  verdict: Verdict;
  reason: ReactNode;
  dur: string;
  doer?: ReactNode;
  current?: boolean;
  stalled?: boolean;
}) {
  const map = {
    pass: { glyph: "✓", label: "pass" },
    reject: { glyph: "✕", label: "reject" },
    partial: { glyph: "~", label: "partial" },
    running: { glyph: "▸", label: "running" }
  } as const;
  const v = map[verdict];
  const cls = "iter-row" + (current ? " is-current" : "") + (stalled ? " is-stalled" : "");
  return (
    <div className={cls}>
      <span className={"iter-row-band " + verdict} />
      <div className="iter-row-body">
        <div className="iter-row-top">
          <span className="iter-row-tag">#{n}</span>
          <span className={"iter-row-glyph " + verdict}>{v.glyph}</span>
          <span className="iter-row-reason">{reason}</span>
          {stalled && <span className="iter-row-pill">same as ↑</span>}
          <span className="iter-row-dur">{dur}</span>
        </div>
        {doer && <div className="iter-row-doer">{doer}</div>}
      </div>
    </div>);

}

/* ─────────────────────── 1. Step Done ─────────────────────── */

function DrawerStepDone() {
  return (
    <div className="drawer">
      <div className="drawer-head">
        <div className="drawer-crumb">
          <span className="mono">feat-auth</span><span className="sep">/</span>
          <span className="mono">step #1</span>
          <span className="sep">·</span>
          <span className="mono" style={{ color: "var(--fg-faint)" }}>⎇ pipeline/feat-auth</span>
          <span className="drawer-crumb-spacer" />
          <button className="drawer-icon-btn" title="Close"><CloseIcon /></button>
        </div>
        <div className="drawer-titlerow">
          <h2 className="drawer-title">DB schema 設計</h2>
          <StatusChip status="done" />
          <ModeChip mode="step" />
        </div>
        <div className="drawer-meta">
          <span>completed 12m ago</span>
          <span className="sep">·</span>
          <span>duration 12:04</span>
          <span className="sep">·</span>
          <span>cost $0.42</span>
          <span className="sep">·</span>
          <span>tokens 8.4k</span>
        </div>
      </div>

      <div className="drawer-body">
        <DSection label="Definition" defaultOpen
        summary="users / sessions / oauth tables · AC ×4 通過">
          <div className="dfield">
            <div className="dfield-label">目標</div>
            <div className="dfield-text">
              設計 auth 模組所需的 PostgreSQL schema:users / sessions / oauth_accounts 三張表,含 indexes 與 cascade 規則,並產出 up / down migration。
            </div>
          </div>
          <div className="dfield">
            <div className="dfield-label">驗收條件</div>
            <div className="ac-list">
              {[
              "users / sessions / oauth_accounts 三張表設計完成",
              "包含必要 indexes 與 cascade 規則",
              "migration 檔可以正向 (up) 與反向 (down) 執行",
              "schema 通過 lint + review"].
              map((t, i) =>
              <div key={i} className="ac-row">
                  <span className="ac-check">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5L20 6" /></svg>
                  </span>
                  <span>{t}</span>
                </div>
              )}
            </div>
            <div className="ac-foot">4 / 4 通過 · 由 critic 在 step run 確認</div>
          </div>
        </DSection>

        <DSection label="Output" defaultOpen aside={<span>3 files · +206 −0</span>}>
          <FileRow path="migrations/0007_auth_schema.up.sql" meta="+128 −0" />
          <FileRow path="migrations/0007_auth_schema.down.sql" meta="+22 −0" />
          <FileRow path="docs/schema/auth.md" meta="+56 −0" />
        </DSection>

        <div className="step-info" data-comment-anchor="0047c72592-div-144-9">
          <span className="icon">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><circle cx="12" cy="16" r="0.7" fill="currentColor" /></svg>
          </span>
          <span><strong style={{ color: "var(--fg)" }}>Step ticket</strong> — 只跑一次,沒有 iteration history。</span>
          <span className="switch">切換為 iter →</span>
        </div>
      </div>

      <div className="drawer-foot">
        <button className="btn">← 返回看板</button>
        <span className="drawer-foot-spacer" />
        <button className="btn btn-primary">⎘ 複製並重跑</button>
      </div>
    </div>);

}

/* ─────────────────────── 2. Iter Running ─────────────────────── */

function DrawerIterRunning({ tick = 0 }: { tick?: number }) {
  const elapsed = 134 + tick;
  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");

  const stream: StreamLine[] = [
  { kind: "h", text: "分析:OAuth callback 失敗的根因" },
  { kind: "p", text: "從上一輪 critic verdict 看,問題在 redirect_uri 在 dev 環境會被 normalize 成 trailing-slash,但 Google Console 註冊的是 no-slash 版本。" },
  { kind: "h", text: "修正策略" },
  { kind: "li", text: "在 oauth 模組的 buildRedirectUri() strip trailing slash" },
  { kind: "li", text: "加 unit test 覆蓋兩種寫法" },
  { kind: "li", text: "更新 docs/auth.md 註明這個 gotcha" },
  { kind: "code", text: "// patch: src/oauth/redirect.ts\nexport function buildRedirectUri(base: string) {\n  return base.replace(/\\/+$/, \"\");\n}" },
  { kind: "p", text: "接著我會跑 critic,確認 AC #2 與 #3 是否通過" }];


  return (
    <div className="drawer">
      <div className="drawer-head">
        <div className="drawer-crumb">
          <span className="mono">feat-auth</span><span className="sep">/</span>
          <span className="mono">iter #2</span>
          <span className="sep">·</span>
          <span className="mono" style={{ color: "var(--fg-faint)" }}>⎇ pipeline/feat-auth</span>
          <span className="drawer-crumb-spacer" />
          <button className="drawer-icon-btn" title="Close"><CloseIcon /></button>
        </div>
        <div className="drawer-titlerow">
          <h2 className="drawer-title">OAuth flow 收斂</h2>
          <StatusChip status="running" />
          <span className="statechip statechip-iter mono" style={{ background: "var(--iter-soft)" }}>iter 4 / ∞</span>
        </div>
        <div className="drawer-meta">
          <span>started 18m ago</span>
          <span className="sep">·</span>
          <span>3 prev iters</span>
          <span className="sep">·</span>
          <span>{m}:{s} / 04:18 elapsed</span>
          <span className="sep">·</span>
          <span>$1.84 spent</span>
        </div>
      </div>

      <div className="drawer-body">
        <DSection label="Definition" defaultOpen={false}
        summary="收斂 OAuth callback 流程 · AC ×4 · iter mode">
          <div className="dfield">
            <div className="dfield-label">目標</div>
            <div className="dfield-text">收斂 OAuth callback 流程,讓 redirect / timeout / state 三條路徑都穩定。</div>
          </div>
        </DSection>

        <DSection label="Iteration history" defaultOpen>
          <div className="iter-list">
            <IterRow n={1} verdict="pass" reason="basic redirect happy path 通過" dur="02:18"
            doer="實作 callback 基本流程 · 加 minimal test" />
            <IterRow n={2} verdict="reject" reason="critic 認為 error path 沒處理 timeout" dur="04:11"
            doer="加 try/catch · 補 timeout 邏輯 · 但 test 漏掉 retry case" />
            <IterRow n={3} verdict="partial" reason="AC #1, #4 通過 / #2, #3 仍紅" dur="02:55"
            doer="加 e2e test · 修 retry 條件" />

            {/* iter 4 — current, expanded with live runner inside */}
            <div className="iter-row is-current iter-row-expanded">
              <div className="iter-row-band running" />
              <div className="iter-row-body" style={{ padding: 0 }}>
                <div className="iter-row-top" style={{ padding: "8px 12px" }}>
                  <span className="iter-row-tag">#4</span>
                  <span className="iter-row-glyph running">▸</span>
                  <span className="iter-row-reason" style={{ color: "var(--running)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span className="pulse live-iter-dot" />
                    running · 修 callback handler
                  </span>
                  <span className="iter-row-dur">{m}:{s}</span>
                </div>

                <div className="live-stream">
                  {stream.map((l, i) => {
                    if (l.kind === "h") return <div key={i} className="ls-h">{l.text}</div>;
                    if (l.kind === "li") return <div key={i} className="ls-li">{l.text}</div>;
                    if (l.kind === "code") return <pre key={i} className="ls-code">{l.text}</pre>;
                    return <div key={i}>{l.text}</div>;
                  })}
                  <div>確認後會把 patch 提交給 critic 做 verdict<span className="ls-cursor blink" /></div>
                </div>

                <div className="live-foot">
                  <span className="live-foot-spacer" />
                  <span className="live-foot-toggle">
                    <span className="mono" style={{ color: "var(--fg-mute)" }}>auto-scroll</span>
                    <span className="tswitch is-on" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DSection>
      </div>

      <div className="drawer-foot">
        <button className="btn">← 返回看板</button>
        <span className="drawer-foot-spacer" />
        <button className="btn" style={{ color: "var(--paused)", borderColor: "color-mix(in srgb, var(--paused) 40%, transparent)" }}>
          ⏸ 暫停 iter
        </button>
      </div>
    </div>);

}

/* ─────────────────────── 3. Step Running ─────────────────────── */

function DrawerStepRunning({ tick = 0 }: { tick?: number }) {
  const elapsed = 84 + tick;
  const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const s = String(elapsed % 60).padStart(2, "0");
  const stream: StreamLine[] = [
  { kind: "h", text: "讀取 schema 需求" },
  { kind: "li", text: "users / sessions / oauth_accounts 三張表" },
  { kind: "li", text: "FK cascade rules · indexes" },
  { kind: "h", text: "撰寫 migration up.sql" },
  { kind: "code", text: "CREATE TABLE users (\n  id uuid PRIMARY KEY,\n  email text UNIQUE NOT NULL,\n  created_at timestamptz DEFAULT now()\n);" },
  { kind: "p", text: "接著寫 sessions / oauth_accounts 與 down.sql" }];

  return (
    <div className="drawer">
      <div className="drawer-head">
        <div className="drawer-crumb">
          <span className="mono">feat-auth</span><span className="sep">/</span>
          <span className="mono">step #1</span>
          <span className="sep">·</span>
          <span className="mono" style={{ color: "var(--fg-faint)" }}>⎇ pipeline/feat-auth</span>
          <span className="drawer-crumb-spacer" />
          <button className="drawer-icon-btn" title="Close"><CloseIcon /></button>
        </div>
        <div className="drawer-titlerow">
          <h2 className="drawer-title">DB schema 設計</h2>
          <StatusChip status="running" />
          <ModeChip mode="step" />
        </div>
        <div className="drawer-meta">
          <span>started 1m ago</span>
          <span className="sep">·</span>
          <span>{m}:{s} elapsed</span>
          <span className="sep">·</span>
          <span>$0.12 spent</span>
        </div>
      </div>

      <div className="drawer-body">
        <DSection label="Definition" defaultOpen={false}
        summary="users / sessions / oauth tables · AC ×4">
          <div className="dfield">
            <div className="dfield-label">目標</div>
            <div className="dfield-text">
              設計 auth 模組所需的 PostgreSQL schema:users / sessions / oauth_accounts 三張表,含 indexes 與 cascade 規則,並產出 up / down migration。
            </div>
          </div>
          <div className="dfield">
            <div className="dfield-label">驗收條件</div>
            <div className="ac-list">
              {[
              "users / sessions / oauth_accounts 三張表設計完成",
              "包含必要 indexes 與 cascade 規則",
              "migration 檔可以正向 (up) 與反向 (down) 執行",
              "schema 通過 lint + review"].
              map((t, i) =>
              <div key={i} className="ac-row" style={{ color: "var(--fg-mute)" }}>
                  <span className="ac-check" style={{ background: "transparent", border: "1px dashed color-mix(in srgb, var(--fg-mute) 60%, transparent)", color: "transparent" }} />
                  <span>{t}</span>
                </div>
              )}
            </div>
            <div className="ac-foot">待 critic 在 step 結束後驗收</div>
          </div>
        </DSection>

        <DSection label="Step run" defaultOpen
        aside={<span style={{ color: "var(--running)" }}>● running</span>}>
          <div className="iter-list">
            <div className="iter-row is-current iter-row-expanded">
              <div className="iter-row-band running" />
              <div className="iter-row-body" style={{ padding: 0 }}>
                <div className="iter-row-top" style={{ padding: "8px 12px" }}>
                  <span className="iter-row-tag">#1</span>
                  <span className="iter-row-glyph running">▸</span>
                  <span className="iter-row-reason" style={{ color: "var(--running)", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span className="pulse live-iter-dot" />
                    running · 撰寫 migration
                  </span>
                  <span className="iter-row-dur">{m}:{s}</span>
                </div>

                <div className="live-stream">
                  {stream.map((l, i) => {
                    if (l.kind === "h") return <div key={i} className="ls-h">{l.text}</div>;
                    if (l.kind === "li") return <div key={i} className="ls-li">{l.text}</div>;
                    if (l.kind === "code") return <pre key={i} className="ls-code">{l.text}</pre>;
                    return <div key={i}>{l.text}</div>;
                  })}
                  <div>下一步:寫 down.sql<span className="ls-cursor blink" /></div>
                </div>

                <div className="live-foot">
                  <span className="live-foot-spacer" />
                  <span className="live-foot-toggle">
                    <span className="mono" style={{ color: "var(--fg-mute)" }}>auto-scroll</span>
                    <span className="tswitch is-on" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </DSection>
      </div>

      <div className="drawer-foot">
        <button className="btn">← 返回看板</button>
        <span className="drawer-foot-spacer" />
        <button className="btn" style={{ color: "var(--paused)", borderColor: "color-mix(in srgb, var(--paused) 40%, transparent)" }}>
          ⏸ 暫停
        </button>
      </div>
    </div>);

}

/* ─────────────────────── 4. Iter Done ─────────────────────── */

function DrawerIterDone() {
  return (
    <div className="drawer">
      <div className="drawer-head">
        <div className="drawer-crumb">
          <span className="mono">feat-auth</span><span className="sep">/</span>
          <span className="mono">iter #2</span>
          <span className="sep">·</span>
          <span className="mono" style={{ color: "var(--fg-faint)" }}>⎇ pipeline/feat-auth</span>
          <span className="drawer-crumb-spacer" />
          <button className="drawer-icon-btn" title="Close"><CloseIcon /></button>
        </div>
        <div className="drawer-titlerow">
          <h2 className="drawer-title">OAuth flow 收斂</h2>
          <StatusChip status="done" />
          <span className="statechip statechip-iter mono">iter 5 / ∞</span>
        </div>
        <div className="drawer-meta">
          <span>completed 3m ago</span>
          <span className="sep">·</span>
          <span>5 iters · 18:42 total</span>
          <span className="sep">·</span>
          <span>$3.21 spent</span>
        </div>
      </div>

      <div className="drawer-body">
        <DSection label="Definition" defaultOpen={false}
        summary="收斂 OAuth callback 流程 · AC ×4 全通過">
          <div className="dfield">
            <div className="dfield-label">目標</div>
            <div className="dfield-text">收斂 OAuth callback 流程,讓 redirect / timeout / state 三條路徑都穩定。</div>
          </div>
          <div className="dfield">
            <div className="dfield-label">驗收條件</div>
            <div className="ac-list">
              {[
              "redirect_uri trailing slash 處理穩定",
              "timeout 在 error path 會 surface",
              "state mismatch 不會 silent fail",
              "test 覆蓋三條路徑"].
              map((t, i) =>
              <div key={i} className="ac-row">
                  <span className="ac-check">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m4 12 5 5L20 6" /></svg>
                  </span>
                  <span>{t}</span>
                </div>
              )}
            </div>
            <div className="ac-foot">4 / 4 通過 · iter 5 critic verdict: pass</div>
          </div>
        </DSection>

        <DSection label="Iteration history" defaultOpen
        aside={<span>5 runs · 全通過於 iter 5</span>}>
          <div className="iter-list">
            <IterRow n={1} verdict="reject" reason="basic redirect 沒處理 trailing slash" dur="02:18" />
            <IterRow n={2} verdict="reject" reason="error path 沒處理 timeout" dur="04:11" />
            <IterRow n={3} verdict="partial" reason="AC #1, #4 通過 / #2, #3 仍紅" dur="02:55" />
            <IterRow n={4} verdict="partial" reason="AC #2 通過 / #3 仍紅" dur="03:08" />
            <IterRow n={5} verdict="pass" reason="所有 AC 通過 · ready to merge" dur="02:42"
            doer="補 state 校驗 · 加 e2e test" />
          </div>
        </DSection>

        <DSection label="Output" defaultOpen aside={<span>4 files · +312 −47</span>}>
          <FileRow path="src/oauth/redirect.ts" meta="+48 −12" />
          <FileRow path="src/oauth/callback.ts" meta="+86 −18" />
          <FileRow path="tests/oauth/flow.spec.ts" meta="+162 −0" />
          <FileRow path="docs/auth.md" meta="+16 −17" />
        </DSection>
      </div>

      <div className="drawer-foot">
        <button className="btn">← 返回看板</button>
        <span className="drawer-foot-spacer" />
        <button className="btn btn-primary">↗ Open PR</button>
      </div>
    </div>);

}

/* ─────────────────────── DrawerStage (host) ─────────────────────── */

const DRAWER_STATES: { id: DrawerState; label: string; Comp: (p: { tick?: number }) => ReactElement }[] = [
{ id: "step-running", label: "Step · running", Comp: DrawerStepRunning },
{ id: "step-done", label: "Step · done", Comp: DrawerStepDone },
{ id: "iter-running", label: "Iter · running", Comp: DrawerIterRunning },
{ id: "iter-done", label: "Iter · done", Comp: DrawerIterDone }];

export { DRAWER_STATES };

export function DrawerStage({ state = "iter-running" }: { state?: DrawerState; showSwitcher?: boolean }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const entry = DRAWER_STATES.find((s) => s.id === state) || DRAWER_STATES[0];
  const Comp = entry.Comp;

  return (
    <div className="drawer-stage">
      {/* dimmed Board behind */}
      <div className="drawer-bg">
        <BoardScreen density="medium" />
      </div>
      <div className="drawer-scrim" />
      <Comp tick={tick} key={state} />
    </div>);

}

// Board — Rail + focus column. Hi-fi version of v3 wireframe.
const { useState, useEffect, useMemo, useRef } = React;

/* ───────── data ───────── */
const PIPELINES = [
{
  id: "feat-auth", name: "feat-auth", branch: "pipeline/feat-auth", state: "paused",
  tickets: [
  { id: "t1", n: 1, title: "DB schema 設計", mode: "step", status: "done", meta: "12 min" },
  { id: "t2", n: 2, title: "OAuth flow 收斂", mode: "iter", status: "paused",
    iter: { current: 6, totalElapsed: 258, stage: "critic", verdicts: [1, 1, 0, -1, -1, -1] },
    reason: "critic 連續 3 次 reject — 同樣的 token refresh edge case"
  },
  { id: "t3", n: 3, title: "route handlers", mode: "step", status: "ready", meta: "等上游" },
  { id: "t4", n: 4, title: "session util", mode: "step", status: "draft" },
  { id: "t5", n: 5, title: "login UI", mode: "step", status: "draft" }]

},
{
  id: "feat-search", name: "feat-search", branch: "pipeline/feat-search", state: "running",
  tickets: [
  { id: "s1", n: 1, title: "indexer skel", mode: "step", status: "done", meta: "8 min" },
  { id: "s2", n: 2, title: "ranking algorithm", mode: "iter", status: "running",
    iter: { current: 3, totalElapsed: 47, stage: "doer", verdicts: [1, 0] },
    liveLog: "doer · drafting BM25 + recency boost…"
  },
  { id: "s3", n: 3, title: "UI 整合", mode: "step", status: "ready", meta: "等上游" }]

},
{
  id: "refactor-api", name: "refactor-api", branch: "pipeline/refactor-api", state: "ready",
  tickets: [
  { id: "r1", n: 1, title: "extract router", mode: "step", status: "done", meta: "6 min" },
  { id: "r2", n: 2, title: "middleware split", mode: "step", status: "done", meta: "9 min" },
  { id: "r3", n: 3, title: "error mapping", mode: "iter", status: "done",
    iter: { current: 4, totalElapsed: 192, stage: "done", verdicts: [0, 1, 1, 1] }, meta: "4 iter" },
  { id: "r4", n: 4, title: "tests", mode: "step", status: "done", meta: "11 min" }]

},
{
  id: "infra-ci", name: "infra-ci", branch: "pipeline/infra-ci", state: "planning",
  tickets: [
  { id: "i1", n: 1, title: "GitHub Actions skel", mode: "step", status: "draft" },
  { id: "i2", n: 2, title: "lint job", mode: "step", status: "draft" },
  { id: "i3", n: 3, title: "test matrix", mode: "step", status: "draft" },
  { id: "i4", n: 4, title: "preview deploy", mode: "step", status: "draft" },
  { id: "i5", n: 5, title: "Slack 通知", mode: "step", status: "draft" },
  { id: "i6", n: 6, title: "release tag", mode: "step", status: "draft" }]

}];


const STATE_COLOR = {
  paused: "var(--paused)", running: "var(--running)", ready: "var(--done)",
  planning: "var(--draft)", failed: "var(--failed)", merged: "var(--fg-faint)",
  done: "var(--done)", draft: "var(--draft)"
};
const STATE_LABEL = {
  paused: "paused", running: "running", ready: "ready to merge",
  planning: "planning", failed: "failed", merged: "merged",
  done: "done", draft: "draft"
};

function fmtElapsed(s) {
  const m = Math.floor(s / 60),sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/* ───────── Board ───────── */
function Board({ density = "medium", startCreating = false }) {
  const [pipelines, setPipelines] = useState(PIPELINES);
  const [activeId, setActiveId] = useState("feat-auth");
  const [creating, setCreating] = useState(startCreating);
  const [tick, setTick] = useState(0);
  // running iter timer
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // sync from prop (so Tweaks toggle works)
  useEffect(() => { setCreating(startCreating); }, [startCreating]);

  // global Esc handler while creating
  useEffect(() => {
    if (!creating) return;
    function onKey(e) { if (e.key === "Escape") setCreating(false); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [creating]);

  const active = useMemo(
    () => pipelines.find((p) => p.id === activeId) || pipelines[0],
    [activeId, pipelines]
  );

  function handleCreate({ name, baseBranch, mergeStrategy }) {
    const id = name;
    const pipeline = {
      id, name, branch: "pipeline/" + name, state: "planning",
      baseBranch, mergeStrategy,
      tickets: []
    };
    setPipelines((arr) => [...arr, pipeline]);
    setActiveId(id);
    setCreating(false);
  }

  return (
    <div className="board-root" data-density={density}>
      <TopBar />
      <div className="board-body">
        <Rail
          pipelines={pipelines}
          activeId={activeId}
          onSelect={setActiveId}
          creating={creating}
          onStartCreate={() => setCreating(true)}
          onCancelCreate={() => setCreating(false)}
          onSubmitCreate={handleCreate}
        />
        {creating ? (
          <CreatePlaceholder />
        ) : (
          <FocusColumn pipeline={active} tick={tick} />
        )}
      </div>
    </div>);

}

function CreatePlaceholder() {
  return (
    <main className="focus focus-create-empty">
      <div className="create-empty fade-up">
        <div className="create-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7 L9 12 L4 17" /><path d="M10 7 L15 12 L10 17" opacity="0.55" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></svg>
        </div>
        <div className="create-empty-title">新 pipeline 還沒建立</div>
        <div className="create-empty-desc">
          填好左側資訊 → 按 <span className="kbd mono">↵</span> → 自動切過去,立刻可以開第一張 ticket。
        </div>
      </div>
    </main>
  );
}

/* ───────── TopBar ───────── */
const PROJECTS = [
{ path: "~/code/vibe-flow", name: "vibe-flow", branch: "main", pipelines: 4, recent: true },
{ path: "~/code/marketing-site", name: "marketing-site", branch: "develop", pipelines: 1 },
{ path: "~/work/billing-svc", name: "billing-svc", branch: "release/2.4", pipelines: 2 },
{ path: "~/code/internal-docs", name: "internal-docs", branch: "main", pipelines: 0 }];


function TopBar() {
  const [proj, setProj] = useState(PROJECTS[0]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {if (e.key === "Escape") setOpen(false);}
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <Logo size={18} />
          <span>vibe-pipeline</span>
        </div>
        <span className="topbar-sep" />

        <div className="proj-switcher" ref={wrapRef}>
          <button
            className={"proj-trigger" + (open ? " is-open" : "")}
            onClick={() => setOpen((o) => !o)}
            title="切換專案">
            
            <FolderIcon />
            <span className="proj-trigger-name">{proj.name}</span>
            <span className="proj-trigger-path mono">{proj.path}</span>
            <ChevronIcon />
          </button>
          {open &&
          <div className="proj-menu fade-up" role="menu">
              <div className="proj-menu-label mono">最近專案</div>
              {PROJECTS.map((p) =>
            <button
              key={p.path}
              className={"proj-menu-item" + (p.path === proj.path ? " is-active" : "")}
              onClick={() => {setProj(p);setOpen(false);}}>
              
                  <FolderIcon />
                  <div className="proj-menu-item-text">
                    <div className="proj-menu-item-name">{p.name}</div>
                    <div className="proj-menu-item-path mono">{p.path}</div>
                  </div>
                  <span className="proj-menu-item-meta mono">
                    {p.pipelines} pipeline{p.pipelines !== 1 ? "s" : ""}
                  </span>
                  {p.path === proj.path && <span className="proj-menu-check"><CheckIconSm /></span>}
                </button>
            )}
              <div className="proj-menu-divider" />
              <button className="proj-menu-item proj-menu-item-action">
                <PlusIcon /><span>選擇其他資料夾…</span>
                <span className="kbd mono" style={{ marginLeft: "auto" }}>⌘O</span>
              </button>
            </div>
          }
        </div>

        <span className="chip mono"><span style={{ color: "var(--fg-mute)" }}>⎇</span> {proj.branch}</span>
      </div>

      <span style={{ flex: 1 }} />

      <div className="topbar-right">
        <button className="icon-btn" title="通知"><BellIcon /><span className="bell-dot" /></button>
        <button className="icon-btn" title="設定"><GearIcon /></button>
      </div>
    </div>);

}

function BudgetGauge({ spent, cap }) {
  const pct = Math.min(1, spent / cap);
  const dash = 2 * Math.PI * 8;
  return (
    <div className="budget-gauge" title={`今日 spend $${spent.toFixed(2)} / $${cap.toFixed(2)}`}>
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--line-2)" strokeWidth="2" />
        <circle cx="10" cy="10" r="8" fill="none"
        stroke="var(--accent)" strokeWidth="2" strokeLinecap="round"
        strokeDasharray={`${pct * dash} ${dash}`}
        transform="rotate(-90 10 10)" />
      </svg>
      <span className="mono">${spent.toFixed(2)}</span>
      <span className="budget-cap mono">/ ${cap.toFixed(0)}</span>
    </div>);

}

/* ───────── Rail ───────── */
function Rail({ pipelines = PIPELINES, activeId, onSelect, creating, onStartCreate, onCancelCreate, onSubmitCreate }) {
  return (
    <aside className={"rail" + (creating ? " is-creating" : "")}>
      <div className="rail-section-label mono">PIPELINES</div>
      <div className="rail-list">
        {pipelines.map((p) =>
          <RailItem key={p.id} p={p} active={p.id === activeId} onClick={() => onSelect(p.id)} muted={creating} />
        )}

        {creating ? (
          <CreateCard
            onCancel={onCancelCreate}
            onSubmit={onSubmitCreate}
            existingNames={pipelines.map(p => p.name)}
          />
        ) : (
          <button className="rail-add" onClick={onStartCreate}>
            <PlusIcon /> <span>新 pipeline</span>
          </button>
        )}
      </div>
      <div className="rail-spacer" />
      <div className={"rail-archive" + (creating ? " is-muted" : "")}>
        <FolderIcon />
        <span>Archive</span>
        <span className="mono" style={{ opacity: 0.55 }}>12</span>
      </div>
    </aside>);

}

/* ───────── CreateCard ───────── */
const BASE_BRANCHES = ["main", "develop", "release/2.4"];
const MERGE_STRATEGIES = [
  { id: "squash",    label: "squash",   hint: "預設" },
  { id: "merge",     label: "merge",    hint: "保留 commits" },
  { id: "rebase",    label: "rebase",   hint: "線性歷史" },
];

function CreateCard({ onCancel, onSubmit, existingNames = [] }) {
  const [stem, setStem] = useState("billing");
  const [baseBranch, setBaseBranch] = useState("main");
  const [mergeStrategy, setMergeStrategy] = useState("squash");
  const [baseOpen, setBaseOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const inputRef = useRef(null);
  const cardRef = useRef(null);

  const name = "feat-" + stem;
  const taken = existingNames.includes(name);
  const valid = stem.trim().length > 0 && !taken && /^[a-z0-9-]+$/.test(stem);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  function submit(e) {
    e?.preventDefault();
    if (!valid) return;
    onSubmit({ name, baseBranch, mergeStrategy });
  }

  return (
    <form className="create-card fade-up" onSubmit={submit} ref={cardRef}>
      <div className="create-card-head">
        <span className="rail-state-dot" style={{ background: "var(--draft)" }} />
        <span className="create-card-eyebrow mono">new pipeline</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="create-x" onClick={onCancel} title="取消 (Esc)" aria-label="取消">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      {/* name */}
      <label className={"create-input" + (taken ? " is-error" : "")}>
        <span className="create-prefix mono">feat-</span>
        <input
          ref={inputRef}
          className="mono"
          type="text"
          value={stem}
          onChange={(e) => setStem(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="create-input-hint mono">{taken ? "已存在" : "Tab ▶"}</span>
      </label>
      {taken && <div className="create-error mono">名稱已存在,改一個。</div>}

      {/* base_branch */}
      <div className="create-field">
        <div className="create-field-label mono">base_branch</div>
        <PickerSelect
          open={baseOpen}
          setOpen={setBaseOpen}
          value={baseBranch}
          onChange={setBaseBranch}
          icon={<span className="mono" style={{ color: "var(--fg-mute)" }}>⎇</span>}
          options={BASE_BRANCHES.map(b => ({ id: b, label: b, mono: true }))}
        />
      </div>

      {/* merge_strategy */}
      <div className="create-field">
        <div className="create-field-label mono">merge_strategy</div>
        <PickerSelect
          open={mergeOpen}
          setOpen={setMergeOpen}
          value={mergeStrategy}
          onChange={setMergeStrategy}
          options={MERGE_STRATEGIES.map(m => ({ id: m.id, label: m.label, hint: m.hint }))}
        />
      </div>

      {/* actions */}
      <div className="create-actions">
        <button type="button" className="btn create-cancel" onClick={onCancel}>
          <span>Esc</span>
          <span style={{ color: "var(--fg-faint)" }}>取消</span>
        </button>
        <button type="submit" className="btn btn-primary create-submit" disabled={!valid}>
          <span>建立</span>
          <span className="kbd-inline mono">↵</span>
        </button>
      </div>
    </form>
  );
}

function PickerSelect({ open, setOpen, value, onChange, options, icon }) {
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, setOpen]);

  const current = options.find(o => o.id === value);

  return (
    <div className="picker" ref={wrapRef}>
      <button
        type="button"
        className={"picker-trigger" + (open ? " is-open" : "")}
        onClick={() => setOpen(o => !o)}
      >
        {icon}
        <span className={current?.mono ? "mono" : ""}>{current?.label}</span>
        {current?.hint && <span className="picker-hint mono">({current.hint})</span>}
        <span style={{ flex: 1 }} />
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className="picker-menu fade-up">
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              className={"picker-item" + (o.id === value ? " is-active" : "")}
              onClick={() => { onChange(o.id); setOpen(false); }}
            >
              {icon && <span style={{ width: 12, display: "inline-flex" }}>{icon}</span>}
              <span className={o.mono ? "mono" : ""}>{o.label}</span>
              {o.hint && <span className="picker-item-hint mono">{o.hint}</span>}
              {o.id === value && <span className="picker-item-check"><CheckIconSm /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RailItem({ p, active, onClick, muted }) {
  const done = p.tickets.filter((t) => t.status === "done").length;
  const total = p.tickets.length;
  return (
    <button className={"rail-item" + (active ? " is-active" : "") + (muted ? " is-muted" : "")} onClick={onClick}>
      <div className="rail-item-row">
        <span className="rail-state-dot" style={{ background: STATE_COLOR[p.state] }} />
        <span className="rail-item-name">{p.name}</span>
        <span className="rail-item-count mono">{done}/{total}</span>
      </div>
      <div className="rail-mini">
        {p.tickets.map((t, i) => {
          const fill = t.status === "done" ? "var(--done)" :
          t.status === "running" ? "var(--running)" :
          t.status === "paused" ? "var(--paused)" :
          t.status === "failed" ? "var(--failed)" :
          t.status === "ready" ? "var(--running-soft)" :
          "var(--line-2)";
          return <span key={i} className={"rail-mini-cell" + (t.status === "running" ? " is-running" : "")} style={{ background: fill }} />;
        })}
      </div>
      <div className="rail-item-meta">
        <span className="mono">⎇ {p.branch.replace("pipeline/", "")}</span>
      </div>
    </button>);

}

/* ───────── Focus column ───────── */
function FocusColumn({ pipeline, tick }) {
  const stateColor = STATE_COLOR[pipeline.state];
  const stateLabel = STATE_LABEL[pipeline.state];
  const done = pipeline.tickets.filter((t) => t.status === "done").length;
  const total = pipeline.tickets.length;
  const allDone = done === total && pipeline.state === "ready";

  return (
    <main className="focus" key={pipeline.id}>
      {/* header */}
      <div className="focus-head fade-up">
        <div className="focus-head-top">
          <h2 className="focus-title">{pipeline.name}</h2>
          <span className="chip mono"><span style={{ color: "var(--fg-mute)" }}>⎇</span> {pipeline.branch}</span>
          <span className="chip chip-state" style={{ color: stateColor, borderColor: "transparent", background: "color-mix(in srgb, " + stateColor + " 14%, transparent)" }}>
            <span className="dot" style={{ background: stateColor }} /> {stateLabel}
          </span>
          <span className="focus-count mono">{done} / {total} done</span>

          <span style={{ flex: 1 }} />

          <button className="btn"><PlusIcon /> ticket</button>
        </div>

        {allDone && <ReadyBanner pipeline={pipeline} />}
      </div>

      {/* tickets */}
      <div className="focus-list">
        {pipeline.tickets.map((t, i) =>
        <TicketCard key={t.id} ticket={t} tick={tick} index={i} />
        )}
      </div>
    </main>);

}

function PausedBanner({ pipeline }) {
  const t = pipeline.tickets.find((x) => x.status === "paused");
  return (
    <div className="banner banner-paused fade-up">
      <span className="banner-icon">
        <WarnIcon />
      </span>
      <div className="banner-body">
        <div className="banner-title">{pipeline.name} · {t?.title} stalled</div>
        <div className="banner-desc">{t?.reason || "需要使用者介入"}</div>
      </div>
      <button className="btn btn-primary">介入 →</button>
    </div>);

}

function ReadyBanner({ pipeline }) {
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
      <button className="btn btn-primary"><MergeIcon /> Merge to main</button>
    </div>);

}

/* ───────── Ticket card ───────── */
function TicketCard({ ticket, tick, index }) {
  const isIter = ticket.mode === "iter";
  const isRunning = ticket.status === "running";
  const isPaused = ticket.status === "paused";
  const isDone = ticket.status === "done";
  const isDraft = ticket.status === "draft";
  const isReady = ticket.status === "ready";

  const elapsed = isRunning && ticket.iter ?
  ticket.iter.totalElapsed + tick :
  ticket.iter?.totalElapsed;

  const accent = STATE_COLOR[ticket.status] || "var(--draft)";

  return (
    <div className={"ticket" + (isDraft ? " is-draft" : "") + (isPaused ? " is-paused" : "")}
    style={{ animationDelay: `${index * 40}ms` }}>
      <span className="ticket-band" style={{ background: accent }} />

      <div className="ticket-row">
        <span className="ticket-num mono">{String(ticket.n).padStart(2, "0")}</span>
        <div className="ticket-title">{ticket.title}</div>

        <span className={"chip ticket-mode" + (isIter ? " is-iter" : "")}>
          {ticket.mode}
        </span>

        <StatusPill status={ticket.status} />

        {ticket.meta && !isIter && <span className="ticket-meta mono">{ticket.meta}</span>}
      </div>

      {isIter &&
      <div className="ticket-iter">
          <IterStages stage={ticket.iter.stage} status={ticket.status} />
          <Verdicts list={ticket.iter.verdicts} blink={isPaused} />
          <span className="iter-meta mono">
            iter <strong>{ticket.iter.current}</strong> · {fmtElapsed(elapsed)} elapsed
            {isRunning && <span className="live-dot pulse" />}
          </span>
        </div>
      }

      {isRunning && ticket.liveLog &&
      <div className="ticket-livelog mono">
          <span className="livelog-cursor blink">▸</span> {ticket.liveLog}
        </div>
      }

      {isPaused &&
      <div className="ticket-paused-actions">
          <span className="paused-reason">{ticket.reason}</span>
          <button className="btn btn-ghost">retry as-is</button>
          <button className="btn btn-primary">介入 →</button>
        </div>
      }
    </div>);

}

function StatusPill({ status }) {
  const c = STATE_COLOR[status];
  const label = STATE_LABEL[status];
  const isLive = status === "running";
  return (
    <span className="status-pill mono" style={{ color: c }}>
      <span className={"status-pill-dot" + (isLive ? " pulse" : "")} style={{ background: c }} />
      {label}
    </span>);

}

function IterStages({ stage, status }) {
  const stages = ["doer", "critic", "✓"];
  const idx = stages.indexOf(stage);
  return (
    <div className="iter-stages">
      {stages.map((s, i) =>
      <React.Fragment key={s}>
          <span className={
        "iter-stage" + (
        i < idx ? " is-past" : "") + (
        i === idx ? " is-active" : "") + (
        status === "paused" && i === idx ? " is-paused" : "")
        }>
            {s}
            {status === "paused" && i === idx && " ⏸"}
            {status === "running" && i === idx && <span className="iter-stage-pulse pulse" />}
          </span>
          {i < stages.length - 1 && <span className="iter-stage-arrow">→</span>}
        </React.Fragment>
      )}
    </div>);

}

function Verdicts({ list, blink }) {
  return (
    <span className="verdicts mono">
      <span className="verdicts-label">verdicts</span>
      {list.map((v, i) => {
        const last = i === list.length - 1;
        const cls = "verdict-pip " + (
        v === 1 ? "is-pass" : v === -1 ? "is-fail" : "is-warn") + (
        last && blink ? " blink" : "");
        return <span key={i} className={cls} />;
      })}
    </span>);

}

/* ───────── inline icons ───────── */
function PlusIcon() {return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;}
function SearchIcon() {return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;}
function BellIcon() {return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>;}
function GearIcon() {return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;}
function EyeIcon() {return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;}
function FolderIcon() {return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" /></svg>;}
function WarnIcon() {return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5" /><circle cx="12" cy="17.5" r="0.8" fill="currentColor" /></svg>;}
function MergeIcon() {return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><path d="M6 8v8" /><path d="M6 8a8 8 0 0 0 8 8h2" /></svg>;}
function CheckCircleIcon() {return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;}
function ChevronIcon() {return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;}
function CheckIconSm() {return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12.5 9.5 18 20 6" /></svg>;}

if (typeof Logo === "undefined") {
  function Logo({ size = 20 }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="vibe-pipeline">
        <path d="M4 7 L9 12 L4 17"
        stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 7 L15 12 L10 17"
        stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        opacity="0.55" />
        <circle cx="19" cy="12" r="2" fill="var(--accent)" />
      </svg>);

  }
  window.Logo = Logo;
}

Object.assign(window, { Board, TopBar, Rail, FocusColumn, PIPELINES, STATE_COLOR, STATE_LABEL, fmtElapsed });
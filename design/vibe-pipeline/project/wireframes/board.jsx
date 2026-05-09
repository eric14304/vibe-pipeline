// Board-level wireframes: 整體看板 (kanban + top bar)
// 3 variations: classic, dense / pivoted-with-rail, focus-mode

// Tiny shared atoms for sketchy chrome
const TopBar = ({ dark, branch="main", variant }) => (
  <div className={"sk sk-thin"} style={{
    height: 48, borderRadius: 0, borderTop: 0, borderLeft: 0, borderRight: 0,
    display: "flex", alignItems: "center", padding: "0 12px",
    background: dark ? "#181b21" : "#f3eede", borderColor: dark ? "#3a3a40" : "#1c1916",
    fontSize: 11, gap: 10,
  }}>
    {/* left: project + repo + branch */}
    <span style={{ fontWeight: 700 }}>vibe-flow</span>
    <span className="wf-mono" style={{ opacity: .55, fontSize: 10 }}>~/code/vibe-flow</span>
    <span className="chip wf-mono">⎇ {branch}</span>
    <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
      <div className="sk sk-thin" style={{ width: 220, height: 22, borderRadius: 11,
        display:"flex", alignItems:"center", padding:"0 10px", fontSize: 10, opacity: .6 }}>
        🔍 search / filter…
      </div>
    </div>
    {/* right: budget gauge + bell + +pipeline + settings */}
    <BudgetGauge variant={variant} />
    <span style={{ opacity: .7 }}>🔔</span>
    <div className="sk sk-thin sk-fill-purple" style={{ padding: "2px 8px", fontSize: 10 }}>+ Pipeline</div>
    <span style={{ opacity: .7 }}>⚙</span>
  </div>
);

const BudgetGauge = ({ variant = "bar" }) => {
  if (variant === "ring") {
    return (
      <span title="預算" style={{ display:"inline-flex", alignItems:"center", gap: 4 }}>
        <svg width="18" height="18" viewBox="0 0 18 18">
          <circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.25" />
          <path d="M9 2 a7 7 0 0 1 5.5 11.3" fill="none" stroke="#c98a2a" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
        <span className="wf-mono" style={{ fontSize: 9 }}>$3.40</span>
      </span>
    );
  }
  if (variant === "tiered") {
    return (
      <span style={{ display:"inline-flex", gap: 2 }}>
        {[0,1,2].map(i => (
          <span key={i} style={{
            width: 16, height: 6, borderRadius: 2,
            background: i===0?"#3a8a4a":i===1?"#c98a2a":"#dcd6c8" }} />
        ))}
        <span className="wf-mono" style={{ fontSize: 9, marginLeft: 3 }}>$3.40</span>
      </span>
    );
  }
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap: 4 }}>
      <span className="sk sk-thin" style={{ width: 56, height: 6, padding: 0, position: "relative" }}>
        <span style={{ position:"absolute", inset: 0, width: "62%", background: "#c98a2a" }} />
      </span>
      <span className="wf-mono" style={{ fontSize: 9 }}>$3.40 / $5</span>
    </span>
  );
};

const ColumnHeader = ({ name, branch, state, m, n, dark, accent }) => {
  const stateColors = {
    planning: ["#8a8478", "灰"],
    running:  ["#3a6fb0", "藍"],
    paused:   ["#c98a2a", "琥珀"],
    "ready to merge": ["#3a8a4a", "綠"],
    merged:   ["#6a6258", "灰"],
    failed:   ["#b04040", "紅"],
  };
  const [c] = stateColors[state] || ["#8a8478"];
  return (
    <div style={{ padding: "8px 10px 6px", display:"flex", flexDirection:"column", gap: 4,
      borderBottom: "1.5px solid " + (dark ? "#3a3a40" : "#1c1916"),
      background: accent || (dark ? "#1d2025" : "#f6efe0") }}>
      <div style={{ display:"flex", alignItems:"center", gap: 6, fontSize: 11, fontWeight: 700 }}>
        <span style={{ flex: 1 }}>{name}</span>
        <span style={{ opacity:.5 }}>⋯</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap: 4, fontSize: 9 }}>
        <span className="chip wf-mono" style={{ fontSize: 9 }}>⎇ {branch}</span>
        <span className="chip" style={{ fontSize: 9, color: c, borderColor: c }}>● {state}</span>
        <span className="wf-mono" style={{ marginLeft: "auto", fontSize: 9, opacity: .65 }}>{m}/{n}</span>
      </div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginTop: 2 }}>
        <span className="sk sk-thin sk-dash" style={{ padding: "1px 6px", fontSize: 9 }}>+ ticket</span>
      </div>
    </div>
  );
};

const StepCard = ({ status="ready", title="auth UI 草稿", mode="step", note, mini, dark }) => (
  <div className="sk sk-thin" style={{
    position: "relative", padding: "8px 10px 8px 14px", margin: "8px 8px 0",
    fontSize: 10, lineHeight: 1.35,
  }}>
    <span className={"band band-" + ({draft:"gray",ready:"blue",running:"indigo",paused:"amber",done:"green",failed:"red"})[status]} />
    <div style={{ display:"flex", alignItems:"flex-start", gap: 6 }}>
      <div style={{ flex: 1, fontWeight: 600 }}>{title}</div>
      <span className="chip" style={{ fontSize: 8 }}>{mode}</span>
      {status==="paused" && <span title="stalled" style={{ color:"#c98a2a" }}>⚠</span>}
      {status==="failed" && <span style={{ color:"#b04040" }}>✕</span>}
      {status==="running" && <span className="pulse" style={{ width:6, height:6, borderRadius:3, background:"#4a4fb0" }} />}
    </div>
    {!mini && note && <div className="wf-mono" style={{ opacity:.55, fontSize: 9, marginTop: 3 }}>{note}</div>}
  </div>
);

const IterCard = ({ status="running", title="API contract 收斂", iter=5, elapsed="03:42",
  dots=[1,1,1,0,0], stage="critic", dark, paused }) => {
  const stages = ["doer", "critic", "✓"];
  const stageIdx = stages.indexOf(stage);
  return (
    <div className="sk sk-thin" style={{
      position: "relative", padding: "8px 10px 9px 14px", margin: "8px 8px 0",
      fontSize: 10, lineHeight: 1.35,
    }}>
      <span className={"band band-" + ({running:"indigo",paused:"amber",done:"green",failed:"red",ready:"blue",draft:"gray"})[status]} />
      <div style={{ display:"flex", alignItems:"flex-start", gap: 6 }}>
        <div style={{ flex: 1, fontWeight: 600 }}>{title}</div>
        <span className="chip" style={{ fontSize: 8, background: dark?"#2a1f3a":"#e7dff2", borderColor: "transparent" }}>iter</span>
        {paused && <span style={{ color:"#c98a2a" }}>⏸</span>}
      </div>
      {/* history dots */}
      <div style={{ display:"flex", gap: 3, marginTop: 5, alignItems:"center" }}>
        <span className="wf-mono" style={{ fontSize: 8, opacity: .5, width: 26 }}>last 5</span>
        {dots.map((d, i) => {
          const last = i === dots.length - 1 && paused;
          return <span key={i} className={"pip pip-" + (d===1?"g":d===-1?"r":"a") + (last?" blink":"")} style={{ width: 7, height: 7 }} />;
        })}
      </div>
      {/* stage diagram */}
      <div style={{ display:"flex", alignItems:"center", gap: 4, marginTop: 5, fontSize: 9 }}>
        {stages.map((s, i) => (
          <React.Fragment key={s}>
            <span className={i===stageIdx?"pulse":""} style={{
              padding: "1px 5px", borderRadius: 3,
              background: i===stageIdx ? (s==="critic"?"#e7dff2":"#cfdcef") : "transparent",
              color: i===stageIdx ? (dark?"#1c1916":"#1c1916") : "inherit",
              border: "1px solid " + (i<=stageIdx ? "#1c1916" : "rgba(0,0,0,0.25)"),
              fontWeight: i===stageIdx ? 700 : 400,
            }}>{s}{paused && i===stageIdx ? " ⏸" : ""}</span>
            {i<stages.length-1 && <span style={{ opacity: .55 }}>▶</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="wf-mono" style={{ fontSize: 9, opacity: .65, marginTop: 4 }}>
        Iter {iter} · {elapsed} elapsed
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────
// Board variant A — classic Linear/Trello kanban
// ──────────────────────────────────────────────────────────────
function BoardClassic({ dark }) {
  return (
    <div className={"wf-board " + (dark ? "dark" : "")}>
      <TopBar dark={dark} branch="main" />
      <div style={{ display:"flex", padding: 12, gap: 10, height: "calc(100% - 48px)", overflow: "hidden", boxSizing:"border-box" }}>
        {/* Col 1: feat-auth, paused */}
        <div className="sk sk-thin" style={{ width: 200, flexShrink: 0, padding: 0, overflow:"hidden" }}>
          <ColumnHeader dark={dark} name="feat-auth" branch="pipeline/feat-auth" state="paused" m={2} n={5} />
          <StepCard status="done" title="DB schema" mode="step" />
          <IterCard status="paused" paused title="OAuth flow 收斂" iter={5} elapsed="03:42" dots={[1,0,-1,-1,-1]} stage="critic" dark={dark} />
          <StepCard status="ready" title="route handlers" mode="step" />
          <StepCard status="draft" title="session util" mode="step" />
          <StepCard status="draft" title="login UI" mode="step" />
        </div>
        {/* Col 2: feat-search, running */}
        <div className="sk sk-thin" style={{ width: 200, flexShrink: 0, padding: 0, overflow:"hidden" }}>
          <ColumnHeader dark={dark} name="feat-search" branch="pipeline/feat-search" state="running" m={1} n={3} />
          <StepCard status="done" title="indexer skel" />
          <StepCard status="running" title="ranking algorithm" />
          <StepCard status="ready" title="UI 整合" />
        </div>
        {/* Col 3: refactor-api, ready to merge */}
        <div className="sk sk-thin" style={{ width: 200, flexShrink: 0, padding: 0, overflow:"hidden" }}>
          <ColumnHeader dark={dark} name="refactor-api" branch="pipeline/refactor-api" state="ready to merge" m={4} n={4} />
          <StepCard status="done" title="extract router" />
          <StepCard status="done" title="middleware split" />
          <StepCard status="done" title="error mapping" />
          <StepCard status="done" title="tests" />
        </div>
        {/* Ghost column */}
        <div className="sk sk-thin sk-dash" style={{ width: 200, flexShrink: 0,
          display:"flex", alignItems:"center", justifyContent:"center", color: dark?"#7a7565":"#8a8478", fontSize: 11 }}>
          + Add pipeline
        </div>
        {/* Archive (collapsed) */}
        <div className="sk sk-thin sk-fill-mute" style={{ width: 36, flexShrink: 0, writingMode:"vertical-rl",
          textOrientation:"mixed", textAlign:"center", padding: "10px 0", fontSize: 10, opacity: .7 }}>
          ▣ Archive (12)
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Board variant B — left rail (pipeline overview) + main column focus
// Different interaction model: rail is the at-a-glance, main shows ONE
// pipeline expanded with iter cards full-detail. Click rail to swap.
// ──────────────────────────────────────────────────────────────
function BoardRail({ dark }) {
  return (
    <div className={"wf-board " + (dark ? "dark" : "")}>
      <TopBar dark={dark} variant="ring" />
      <div style={{ display:"flex", height: "calc(100% - 48px)", overflow: "hidden" }}>
        {/* Left rail: 6-line pipeline overview */}
        <div className="sk sk-thin" style={{ width: 200, borderRadius: 0, borderTop: 0, borderLeft: 0, borderBottom: 0,
          padding: 8, display:"flex", flexDirection:"column", gap: 6, fontSize: 10 }}>
          <div className="wf-mono" style={{ fontSize: 9, opacity: .55, padding: "2px 4px" }}>PIPELINES</div>
          {[
            { n:"feat-auth", state:"paused", c:"#c98a2a", m:2, t:5, sel:true },
            { n:"feat-search", state:"running", c:"#3a6fb0", m:1, t:3 },
            { n:"refactor-api", state:"ready", c:"#3a8a4a", m:4, t:4 },
            { n:"infra-ci", state:"planning", c:"#8a8478", m:0, t:6 },
          ].map((p,i) => (
            <div key={i} className={"sk sk-thin"} style={{
              padding: "6px 8px",
              background: p.sel ? (dark?"#2a2317":"#f6efe0") : "transparent",
              borderColor: p.sel ? (dark?"#d8d2c0":"#1c1916") : "transparent",
              borderStyle: p.sel ? "solid" : "dashed",
              cursor: "pointer",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap: 5 }}>
                <span style={{ width:6, height:6, borderRadius:3, background: p.c }} />
                <span style={{ flex: 1, fontWeight: p.sel?700:500 }}>{p.n}</span>
                <span className="wf-mono" style={{ fontSize:9, opacity:.6 }}>{p.m}/{p.t}</span>
              </div>
              {/* mini-bar of step status */}
              <div style={{ display:"flex", gap: 2, marginTop: 4, height: 4 }}>
                {Array.from({length:p.t}).map((_,j) => (
                  <span key={j} style={{ flex:1, background: j<p.m ? "#3a8a4a" : (j===p.m && p.state==="running" ? "#4a4fb0" : j===p.m && p.state==="paused" ? "#c98a2a" : (dark?"#3a3a40":"#dcd6c8")) }} />
                ))}
              </div>
            </div>
          ))}
          <div className="sk sk-thin sk-dash" style={{ padding: "5px 8px", fontSize: 10, textAlign:"center", opacity: .7 }}>+ pipeline</div>
          <div style={{ flex: 1 }} />
          <div className="wf-mono" style={{ fontSize: 9, opacity: .55, padding: "2px 4px" }}>ARCHIVE (12)</div>
        </div>
        {/* Main: focused pipeline as vertical list with detail */}
        <div style={{ flex: 1, padding: 12, overflow: "hidden" }}>
          <div style={{ display:"flex", alignItems:"baseline", gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>feat-auth</span>
            <span className="chip wf-mono" style={{ fontSize: 9 }}>⎇ pipeline/feat-auth</span>
            <span className="chip" style={{ fontSize: 9, color:"#c98a2a", borderColor:"#c98a2a" }}>● paused</span>
            <span className="wf-mono" style={{ fontSize: 10, opacity: .65 }}>2 / 5 done</span>
            <span style={{ flex: 1 }} />
            <span className="sk sk-thin sk-dash" style={{ padding: "2px 6px", fontSize: 10 }}>+ ticket</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
            <div className="sk sk-thin" style={{ padding: "8px 12px 8px 16px", position:"relative", fontSize: 11 }}>
              <span className="band band-green" />
              <div style={{ display:"flex", gap: 8 }}>
                <span style={{ flex: 1, fontWeight: 600 }}>1. DB schema 設計</span>
                <span className="chip" style={{ fontSize: 9 }}>step</span>
                <span className="wf-mono" style={{ fontSize: 9, opacity: .55 }}>done · 12 min</span>
              </div>
            </div>
            <div className="sk" style={{ padding: "10px 12px 10px 16px", position:"relative", fontSize: 11,
              borderColor:"#c98a2a", borderWidth: 2 }}>
              <span className="band band-amber" style={{ width: 6 }} />
              <div style={{ display:"flex", gap: 8, marginBottom: 6 }}>
                <span style={{ flex: 1, fontWeight: 700 }}>2. OAuth flow 收斂</span>
                <span className="chip sk-fill-purple" style={{ fontSize: 9, background: dark?"#2a1f3a":"#e7dff2", borderColor:"transparent" }}>iter</span>
                <span style={{ color:"#c98a2a", fontSize: 12 }}>⏸ stalled</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap: 8, fontSize: 10 }}>
                <span className="wf-mono" style={{ opacity: .55, fontSize: 9 }}>verdict ↳</span>
                {[1,1,0,-1,-1,-1].map((d,i)=>(
                  <span key={i} className={"pip pip-" + (d===1?"g":d===-1?"r":"a") + (i===5?" blink":"")} />
                ))}
                <span className="wf-mono" style={{ fontSize: 9, opacity: .65, marginLeft: "auto" }}>iter 6 · 04:18</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap: 5, marginTop: 6, fontSize: 9 }}>
                <span style={{ padding:"1px 6px", border:"1px solid currentColor", borderRadius: 3 }}>doer</span>
                <span style={{ opacity:.5 }}>▶</span>
                <span style={{ padding:"1px 6px", borderRadius: 3, background: dark?"#2a1f3a":"#e7dff2", border:"1px solid #1c1916" }}>critic ⏸</span>
                <span style={{ opacity:.5 }}>▶</span>
                <span style={{ padding:"1px 6px", border:"1px solid rgba(0,0,0,.25)", borderRadius: 3, opacity:.5 }}>✓</span>
                <span style={{ flex: 1 }} />
                <span className="sk sk-thin sk-fill-amber" style={{ padding:"2px 8px", fontSize: 10 }}>介入 →</span>
              </div>
            </div>
            <div className="sk sk-thin" style={{ padding: "8px 12px 8px 16px", position:"relative", fontSize: 11, opacity: .7 }}>
              <span className="band band-blue" />
              <div style={{ display:"flex", gap: 8 }}>
                <span style={{ flex: 1, fontWeight: 600 }}>3. route handlers</span>
                <span className="chip" style={{ fontSize: 9 }}>step</span>
                <span className="wf-mono" style={{ fontSize: 9, opacity: .55 }}>ready · 等上游</span>
              </div>
            </div>
            <div className="sk sk-thin sk-dash" style={{ padding: "8px 12px", fontSize: 11, opacity: .55, textAlign:"center" }}>
              4. session util · draft
            </div>
            <div className="sk sk-thin sk-dash" style={{ padding: "8px 12px", fontSize: 11, opacity: .55, textAlign:"center" }}>
              5. login UI · draft
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Board variant C — high density, ALL pipelines visible, mini-cards
// Different interaction: cards collapse to one-liner; expand on hover
// of column. Designed for users running 6+ concurrent pipelines.
// ──────────────────────────────────────────────────────────────
function BoardDense({ dark }) {
  const cols = [
    { name:"feat-auth",    branch:"pipeline/feat-auth",  state:"paused",          m:2, n:5, accent: dark?"#3a2d12":"#fce9c4" },
    { name:"feat-search",  branch:"pipeline/feat-search",state:"running",         m:1, n:3 },
    { name:"refactor-api", branch:"pipeline/refactor",   state:"ready to merge",  m:4, n:4, accent: dark?"#1f3320":"#d8ecd8" },
    { name:"infra-ci",     branch:"pipeline/infra-ci",   state:"planning",        m:0, n:6 },
    { name:"perf-db",      branch:"pipeline/perf-db",    state:"running",         m:2, n:4 },
    { name:"docs-rewrite", branch:"pipeline/docs",       state:"merged",          m:3, n:3 },
  ];
  const ticketsFor = (col) => {
    const out = [];
    for (let i = 0; i < col.n; i++) {
      let s = "draft";
      if (i < col.m) s = "done";
      else if (i === col.m) {
        if (col.state === "running") s = "running";
        else if (col.state === "paused") s = "paused";
        else if (col.state === "failed") s = "failed";
        else if (col.state === "ready to merge" || col.state === "merged") s = "done";
        else s = "ready";
      } else s = i === col.m + 1 ? "ready" : "draft";
      out.push(s);
    }
    return out;
  };

  return (
    <div className={"wf-board " + (dark ? "dark" : "")}>
      <TopBar dark={dark} variant="tiered" />
      {/* persistent banner (paused) */}
      <div style={{
        background: "#fce9c4", color:"#5a4a1a",
        borderBottom: "1.5px solid #c98a2a", padding:"4px 12px", fontSize: 10,
        display:"flex", alignItems:"center", gap: 8 }}>
        <span>⚠</span>
        <span>feat-auth · OAuth flow stalled (3 連續無進展)</span>
        <span style={{ flex: 1 }} />
        <span className="sk sk-thin" style={{ padding: "1px 6px", fontSize: 9, background:"#fff" }}>檢視 →</span>
        <span style={{ opacity:.6 }}>×</span>
      </div>
      <div style={{ display:"flex", padding: 8, gap: 6, height: "calc(100% - 48px - 26px)", overflow: "hidden", boxSizing:"border-box" }}>
        {cols.map((c, idx) => {
          const ts = ticketsFor(c);
          const muted = c.state === "merged";
          return (
            <div key={idx} className="sk sk-thin" style={{
              width: 140, flexShrink: 0, padding: 0, overflow:"hidden",
              opacity: muted ? 0.55 : 1,
              background: c.accent || (dark?"#1d2025":"#fff"),
            }}>
              <div style={{ padding: "6px 7px 5px", borderBottom: "1px solid " + (dark?"#3a3a40":"#1c1916"), fontSize: 10 }}>
                <div style={{ display:"flex", alignItems:"center", gap: 4 }}>
                  <span style={{ flex:1, fontWeight: 700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</span>
                  <span style={{ opacity:.5, fontSize: 9 }}>⋯</span>
                </div>
                <div className="wf-mono" style={{ fontSize: 8, opacity:.6, marginTop: 1 }}>⎇ {c.branch.replace("pipeline/","")}</div>
                <div style={{ display:"flex", alignItems:"center", gap: 4, marginTop: 3 }}>
                  <span className="chip" style={{
                    fontSize: 8, padding:"0 4px",
                    color: c.state==="paused"?"#c98a2a":c.state==="running"?"#3a6fb0":c.state==="ready to merge"?"#3a8a4a":"#6a6258",
                    borderColor:"currentColor"
                  }}>● {c.state}</span>
                  <span className="wf-mono" style={{ fontSize: 8, marginLeft:"auto", opacity:.65 }}>{c.m}/{c.n}</span>
                </div>
              </div>
              {/* mini cards */}
              <div style={{ padding: "5px 5px 0" }}>
                {ts.map((s, i) => (
                  <div key={i} className="sk sk-thin" style={{
                    position:"relative", padding: "4px 5px 4px 9px", marginBottom: 4, fontSize: 9,
                    display:"flex", alignItems:"center", gap: 4,
                  }}>
                    <span className={"band band-" + ({draft:"gray",ready:"blue",running:"indigo",paused:"amber",done:"green",failed:"red"})[s]} style={{ width: 3 }} />
                    <span style={{ flex: 1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      <span className="squig short" style={{ width: 50 + (i*7)%30, height: 5 }} />
                    </span>
                    {s==="running" && <span className="pulse" style={{ width:5,height:5,borderRadius:3, background:"#4a4fb0" }} />}
                    {s==="paused" && <span style={{ color:"#c98a2a", fontSize: 10 }}>⚠</span>}
                  </div>
                ))}
                <div className="sk sk-thin sk-dash" style={{ padding: "2px 5px", fontSize: 9, textAlign:"center", opacity: .55, marginBottom: 4 }}>+</div>
              </div>
            </div>
          );
        })}
        <div className="sk sk-thin sk-dash" style={{ width: 100, flexShrink: 0,
          display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10, opacity:.6 }}>
          + Add pipeline
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BoardClassic, BoardRail, BoardDense, TopBar, ColumnHeader, StepCard, IterCard });

// Pipeline state — Ready to merge
// 整張 BoardRail 變體:rail 該 pipeline 綠 dot,main 顯示 5/5 done + 大 Merge 按鈕

function PipelineReadyToMerge({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const greenBg = dark ? "#1f3320" : "#d8ecd8";

  const rail = [
    { n:"feat-auth",    state:"paused",  c:"#c98a2a", m:2, t:5 },
    { n:"feat-search",  state:"running", c:"#3a6fb0", m:1, t:3 },
    { n:"refactor-api", state:"ready",   c:"#3a8a4a", m:5, t:5, sel:true },
    { n:"infra-ci",     state:"planning",c:"#8a8478", m:0, t:6 },
  ];

  const tickets = [
    { n:1, title:"extract router",     dur:"08:12", mode:"step", cost:"$0.31" },
    { n:2, title:"middleware split",   dur:"11:04", mode:"step", cost:"$0.42" },
    { n:3, title:"error mapping 收斂",  dur:"06:48", mode:"iter", cost:"$0.88", iters: 3 },
    { n:4, title:"tests · unit + e2e", dur:"14:21", mode:"step", cost:"$0.51" },
    { n:5, title:"docs · API 表",      dur:"04:30", mode:"step", cost:"$0.18" },
  ];

  return (
    <div className={"wf-board " + (dark ? "dark" : "")}>
      <TopBar dark={dark} variant="ring" branch="main" />
      <div style={{ display:"flex", height: "calc(100% - 48px)", overflow: "hidden" }}>
        {/* Left rail */}
        <div className="sk sk-thin" style={{
          width: 200, borderRadius: 0, borderTop: 0, borderLeft: 0, borderBottom: 0,
          padding: 8, display:"flex", flexDirection:"column", gap: 6, fontSize: 10,
        }}>
          <div className="wf-mono" style={{ fontSize: 9, opacity: .55, padding: "2px 4px" }}>PIPELINES</div>
          {rail.map((p, i) => (
            <div key={i} className="sk sk-thin" style={{
              padding: "6px 8px",
              background: p.sel ? greenBg : "transparent",
              borderColor: p.sel ? "#3a8a4a" : "transparent",
              borderStyle: p.sel ? "solid" : "dashed",
              borderWidth: p.sel ? 1.5 : 1,
              cursor: "pointer",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap: 5 }}>
                <span style={{ width:7, height:7, borderRadius:4, background: p.c }} />
                <span style={{ flex: 1, fontWeight: p.sel ? 700 : 500 }}>{p.n}</span>
                {p.sel && <span style={{ color:"#3a8a4a", fontSize: 10, fontWeight: 700 }}>ready</span>}
                <span className="wf-mono" style={{ fontSize: 9, opacity:.6 }}>{p.m}/{p.t}</span>
              </div>
              <div style={{ display:"flex", gap: 2, marginTop: 4, height: 4 }}>
                {Array.from({ length: p.t }).map((_, j) => (
                  <span key={j} style={{
                    flex: 1,
                    background: p.sel
                      ? "#3a8a4a"
                      : j < p.m
                        ? "#3a8a4a"
                        : (j === p.m && p.state === "running" ? "#4a4fb0"
                            : j === p.m && p.state === "paused" ? "#c98a2a"
                            : (dark ? "#3a3a40" : "#dcd6c8")),
                  }} />
                ))}
              </div>
            </div>
          ))}
          <div className="sk sk-thin sk-dash" style={{ padding: "5px 8px", fontSize: 10, textAlign:"center", opacity:.7 }}>+ pipeline</div>
          <div style={{ flex: 1 }} />
          <div className="wf-mono" style={{ fontSize: 9, opacity:.55, padding:"2px 4px" }}>ARCHIVE (12)</div>
        </div>

        {/* Main column */}
        <div style={{ flex: 1, padding: 16, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {/* Header row */}
          <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 18, fontWeight: 700 }}>refactor-api</span>
            <span className="chip wf-mono" style={{ fontSize: 10 }}>⎇ pipeline/refactor-api</span>
            <span className="chip" style={{
              fontSize: 10, padding:"2px 8px", fontWeight: 600,
              color:"#3a8a4a", borderColor:"#3a8a4a", background: greenBg,
              display:"inline-flex", alignItems:"center", gap: 5,
            }}>● ready to merge</span>
            <span className="wf-mono" style={{ fontSize: 11, color:"#3a8a4a", fontWeight: 700 }}>5 / 5 done</span>
            <span style={{ flex: 1 }} />
            <span className="sk sk-thin" style={{ padding:"4px 9px", fontSize: 10, background: dark?"#1d2025":"#fff" }}>view diff</span>
            <span className="sk sk-thin" style={{ padding:"4px 9px", fontSize: 10, background: dark?"#1d2025":"#fff" }}>⋯</span>
            {/* Primary green merge button */}
            <span className="sk" style={{
              padding:"6px 16px", fontSize: 12, fontWeight: 700,
              background:"#3a8a4a", color:"#fff", borderColor:"#2d6e3a",
              borderWidth: 2,
              boxShadow: "0 4px 12px rgba(58,138,74,.35)",
              display:"inline-flex", alignItems:"center", gap: 6,
            }}>
              ⎌ Merge to main
            </span>
          </div>
          <div className="wf-mono" style={{ fontSize: 10, color: sub, marginBottom: 14, display:"flex", gap: 12 }}>
            <span>completed 6m ago</span>
            <span>· duration 45:55</span>
            <span>· cost $2.30</span>
            <span>· 3 commits ahead of main</span>
          </div>

          {/* All-done banner */}
          <div style={{
            padding: "8px 12px", marginBottom: 12,
            background: greenBg, color:"#3a8a4a",
            border: "1.5px solid #3a8a4a", borderRadius: 6,
            display:"flex", alignItems:"center", gap: 8, fontSize: 11.5,
          }}>
            <span style={{ fontSize: 14 }}>✓</span>
            <span style={{ fontWeight: 700 }}>所有 ticket 完成,critic 全綠 — 等你按 merge</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ fontSize: 10, opacity:.85 }}>CI: passing · 0 conflicts</span>
          </div>

          {/* Ticket rows — all done */}
          <div style={{ display:"flex", flexDirection:"column", gap: 6, flex: 1, overflow:"hidden" }}>
            {tickets.map((t, i) => (
              <div key={i} className="sk sk-thin" style={{
                padding:"6px 12px 6px 16px", position:"relative", fontSize: 11,
                background: dark ? "#161a20" : "#fff",
              }}>
                <span className="band band-green" />
                <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
                  <span className="wf-mono" style={{ width: 22, opacity:.55, fontSize: 10 }}>{t.n}.</span>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3, fontSize: 9, fontWeight: 700,
                    background:"#3a8a4a", color:"#fff",
                    display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink: 0,
                  }}>✓</span>
                  <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
                  <span className="chip" style={{
                    fontSize: 9, padding:"1px 6px",
                    background: t.mode === "iter" ? (dark?"#2a1f3a":"#e7dff2") : "transparent",
                    borderColor: t.mode === "iter" ? "transparent" : "currentColor",
                  }}>{t.mode}{t.iters ? ` · ${t.iters}` : ""}</span>
                  <span className="wf-mono" style={{ fontSize: 9, color: sub, width: 60, textAlign:"right" }}>{t.dur}</span>
                  <span className="wf-mono" style={{ fontSize: 9, color: sub, width: 50, textAlign:"right" }}>{t.cost}</span>
                  <span style={{ opacity:.4, fontSize: 11 }}>▸</span>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom muted note */}
          <div style={{
            marginTop: 12, paddingTop: 10,
            borderTop: "1px dashed " + hair,
            display:"flex", alignItems:"center", gap: 8, fontSize: 10.5, color: sub,
          }}>
            <span style={{ opacity:.7 }}>ⓘ</span>
            <span>Squash merge — branch 留作歷史(自動 archive 到「Archive」),不會被刪除</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ fontSize: 9, opacity:.6, cursor:"pointer" }}>merge 設定 ▸</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PipelineReadyToMerge });

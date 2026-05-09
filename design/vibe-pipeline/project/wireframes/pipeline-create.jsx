// Pipeline 創建 · Rail ghost 展開
function PipelineCreateGhost({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const focusBg = dark ? "#2a1f3a" : "#e7dff2";

  const rail = [
    { n:"feat-auth",    state:"paused",  c:"#c98a2a", m:2, t:5 },
    { n:"feat-search",  state:"running", c:"#3a6fb0", m:1, t:3 },
    { n:"refactor-api", state:"ready",   c:"#3a8a4a", m:5, t:5 },
    { n:"infra-ci",     state:"planning",c:"#8a8478", m:0, t:6 },
  ];

  return (
    <div className={"wf-board " + (dark ? "dark" : "")}>
      <TopBar dark={dark} variant="ring" branch="main" />
      <div style={{ display:"flex", height: "calc(100% - 48px)", overflow: "hidden" }}>
        {/* RAIL */}
        <div className="sk sk-thin" style={{
          width: 200, borderRadius: 0, borderTop: 0, borderLeft: 0, borderBottom: 0,
          padding: 8, display:"flex", flexDirection:"column", gap: 6, fontSize: 10,
          background: dark ? "#13161b" : "#f3eede",
        }}>
          <div className="wf-mono" style={{ fontSize: 9, opacity: .55, padding: "2px 4px" }}>PIPELINES</div>

          {/* Existing rail items — muted */}
          {rail.map((p, i) => (
            <div key={i} className="sk sk-thin" style={{
              padding: "6px 8px", opacity: 0.4,
              borderColor: "transparent", borderStyle:"dashed",
            }}>
              <div style={{ display:"flex", alignItems:"center", gap: 5 }}>
                <span style={{ width:6, height:6, borderRadius:3, background: p.c }} />
                <span style={{ flex: 1, fontWeight: 500 }}>{p.n}</span>
                <span className="wf-mono" style={{ fontSize:9, opacity:.7 }}>{p.m}/{p.t}</span>
              </div>
              <div style={{ display:"flex", gap: 2, marginTop: 4, height: 4 }}>
                {Array.from({length:p.t}).map((_,j) => (
                  <span key={j} style={{ flex: 1, background: j<p.m ? "#3a8a4a" : (dark?"#3a3a40":"#dcd6c8") }} />
                ))}
              </div>
            </div>
          ))}

          {/* GHOST → 變大的 active 編輯卡 */}
          <div className="sk" style={{
            padding: "10px 10px 12px",
            background: dark ? "#1d1a26" : "#fff",
            borderColor:"#4a4fb0", borderWidth: 2,
            borderStyle:"solid",
            boxShadow: "0 4px 16px rgba(74,79,176,.25)",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap: 5, marginBottom: 6 }}>
              <span style={{ width:6, height:6, borderRadius:3, background:"#8a8478" }} />
              <span className="wf-mono" style={{ fontSize: 9, color: sub, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase" }}>new pipeline</span>
              <span style={{ flex: 1 }} />
              <span style={{ opacity:.5, fontSize: 11, cursor:"pointer" }}>×</span>
            </div>

            {/* name input — focused */}
            <div style={{
              padding:"6px 8px", marginBottom: 8,
              background: dark?"#0e1116":"#fbf8f1",
              border: "1.5px solid #4a4fb0",
              borderRadius: 3, fontSize: 12, fontWeight: 600,
              display:"flex", alignItems:"center", gap: 0,
              fontFamily:"JetBrains Mono, monospace",
            }}>
              <span style={{ color: sub, opacity:.6, marginRight: 1 }}>feat-</span>
              <span>billing</span>
              <span className="blink" style={{
                display:"inline-block", width: 7, height: 13,
                background: fg, marginLeft: 1,
              }} />
              <span style={{ flex: 1 }} />
              <span className="wf-mono" style={{ fontSize: 8.5, color: sub, opacity:.55 }}>Tab ▶</span>
            </div>

            {/* base_branch */}
            <div style={{ marginBottom: 7 }}>
              <div className="wf-mono" style={{
                fontSize: 8.5, fontWeight: 700, letterSpacing: 1,
                textTransform:"uppercase", color: sub, marginBottom: 3,
              }}>base_branch</div>
              <div className="sk sk-thin" style={{
                padding:"4px 7px", fontSize: 10.5,
                background: dark?"#1d2025":"#fbf8f1",
                display:"flex", alignItems:"center", gap: 5,
              }}>
                <span className="wf-mono">⎇ main</span>
                <span style={{ flex: 1 }} />
                <span style={{ opacity:.5, fontSize: 9 }}>▾</span>
              </div>
            </div>

            {/* merge_strategy */}
            <div style={{ marginBottom: 10 }}>
              <div className="wf-mono" style={{
                fontSize: 8.5, fontWeight: 700, letterSpacing: 1,
                textTransform:"uppercase", color: sub, marginBottom: 3,
              }}>merge_strategy</div>
              <div className="sk sk-thin" style={{
                padding:"4px 7px", fontSize: 10.5,
                background: dark?"#1d2025":"#fbf8f1",
                display:"flex", alignItems:"center", gap: 5,
              }}>
                <span>squash</span>
                <span className="wf-mono" style={{ fontSize: 8.5, color: sub, opacity:.55 }}>(預設)</span>
                <span style={{ flex: 1 }} />
                <span style={{ opacity:.5, fontSize: 9 }}>▾</span>
              </div>
            </div>

            {/* actions */}
            <div style={{ display:"flex", gap: 6 }}>
              <span className="sk sk-thin" style={{
                padding:"4px 10px", fontSize: 10,
                background: dark?"#1d2025":"#fff",
                flex: 1, textAlign:"center",
              }}>Esc 取消</span>
              <span className="sk" style={{
                padding:"4px 10px", fontSize: 10, fontWeight: 600,
                background:"#4a4fb0", color:"#fff", borderColor:"#3a3f95",
                flex: 1.2, textAlign:"center",
                display:"inline-flex", alignItems:"center", justifyContent:"center", gap: 4,
              }}>建立 <span className="wf-mono" style={{ fontSize: 8.5, opacity:.7 }}>↵</span></span>
            </div>
          </div>

          {/* + pipeline ghost (disabled-look,因為已展開了) */}
          <div className="sk sk-thin sk-dash" style={{
            padding: "5px 8px", fontSize: 10, textAlign:"center",
            opacity: 0.3,
          }}>+ pipeline</div>

          <div style={{ flex: 1 }} />
          <div className="wf-mono" style={{ fontSize: 9, opacity:.4, padding:"2px 4px" }}>ARCHIVE (12)</div>
        </div>

        {/* MAIN — muted placeholder showing 「建立後會切到這個 pipeline」 */}
        <div style={{
          flex: 1, padding: 24, overflow:"hidden",
          display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
          opacity: 0.5,
        }}>
          <div className="sk sk-thin sk-dash" style={{
            padding: "32px 40px", fontSize: 13, color: sub,
            display:"flex", flexDirection:"column", alignItems:"center", gap: 8,
            maxWidth: 360, textAlign:"center",
          }}>
            <span style={{ fontSize: 28, opacity:.5 }}>⌁</span>
            <span style={{ fontWeight: 600 }}>新 pipeline 還沒建立</span>
            <span className="wf-mono" style={{ fontSize: 10, opacity:.65 }}>
              填好左側資訊 → 按 ↵ → 自動切到這個 pipeline,
              立刻可以開第一張 ticket
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PipelineCreateGhost });

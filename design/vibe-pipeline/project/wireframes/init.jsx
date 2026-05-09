// Init prompt page — 沒 .tickets/ 時的全屏卡片
function InitPrompt({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#1c1916";
  const codeFg = dark ? "#e7e3d8" : "#fbf8f1";

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 0, position:"relative", overflow:"hidden",
      display:"flex", justifyContent:"center", alignItems:"center",
      background: dark ? "#0e1116" : "#fbf8f1",
    }}>
      {/* faint dotted bg */}
      <div style={{
        position:"absolute", inset: 0,
        backgroundImage: `radial-gradient(${dark?"#252830":"#e3ddcc"} 1px, transparent 1px)`,
        backgroundSize: "20px 20px",
        opacity: 0.5, pointerEvents:"none",
      }} />

      {/* CENTER CARD */}
      <div className="sk" style={{
        position:"relative", width: 560, padding: 0,
        background: dark ? "#161a20" : "#fff",
        borderColor: dark ? "#d8d2c0" : "#1c1916",
        borderWidth: 1.5,
        boxShadow: dark ? "0 24px 64px rgba(0,0,0,.55)" : "0 24px 64px rgba(28,25,22,.14)",
      }}>
        {/* glyph */}
        <div style={{
          padding: "28px 28px 0",
          display:"flex", alignItems:"center", gap: 10,
        }}>
          <div className="sk sk-thin" style={{
            width: 48, height: 48, padding: 0,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize: 22, background: dark?"#1d2025":"#f6efe0",
          }}>📂</div>
          <div className="wf-mono" style={{ fontSize: 10, color: sub, lineHeight: 1.45 }}>
            <div style={{ opacity: .55 }}>scanning…</div>
            <div>~/code/your-repo</div>
            <div style={{ color:"#c98a2a" }}>✕ no <span style={{ background: dark?"#3a2d12":"#fce9c4", padding:"0 4px", borderRadius: 2 }}>.tickets/</span> found</div>
          </div>
        </div>

        {/* title + body */}
        <div style={{ padding: "20px 28px 8px" }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>
            This repo isn't set up yet
          </div>
          <div style={{ fontSize: 12.5, color: sub, lineHeight: 1.55 }}>
            vibe-flow 找不到這個 repo 的 <span className="wf-mono" style={{ background: dark?"#1d2025":"#f3eede", padding:"1px 5px", borderRadius: 3 }}>.tickets/</span> 資料夾。
            到專案目錄底下跑一次 <span className="wf-mono">tt init</span>,它會建立資料夾、寫入預設 SKILL.md。
          </div>
        </div>

        {/* command box */}
        <div style={{ padding: "14px 28px 8px" }}>
          <div className="wf-mono" style={{ fontSize: 9, color: sub, marginBottom: 6, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase" }}>
            Run this in your terminal
          </div>
          <div style={{
            background: codeBg, color: codeFg,
            border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
            borderRadius: 4,
            padding: "12px 14px",
            display:"flex", alignItems:"center", gap: 10,
            fontFamily:"JetBrains Mono, monospace", fontSize: 12,
          }}>
            <span style={{ color:"#8a8478" }}>$</span>
            <span style={{ flex: 1 }}>
              cd ~/code/your-repo && <span style={{ color:"#c98a2a", fontWeight: 600 }}>tt init</span>
            </span>
            <span className="sk sk-thin" style={{
              padding:"3px 10px", fontSize: 10,
              background: dark?"#1d2025":"#fff", color: fg,
              borderColor: dark?"#3a3a40":"#1c1916",
              display:"inline-flex", alignItems:"center", gap: 5,
            }}>
              📋 copy
            </span>
          </div>
        </div>

        {/* what it creates (small muted preview) */}
        <div style={{
          padding: "8px 28px 14px",
          fontSize: 10.5, color: sub,
        }}>
          <div className="wf-mono" style={{ fontSize: 9, opacity:.7, marginBottom: 4, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase" }}>
            it'll create
          </div>
          <div className="wf-mono" style={{ fontSize: 10, lineHeight: 1.6 }}>
            <div>.tickets/</div>
            <div style={{ paddingLeft: 14, opacity:.85 }}>├── SKILL.md  <span style={{ opacity:.55 }}>· 預設 doer/critic 規則</span></div>
            <div style={{ paddingLeft: 14, opacity:.85 }}>├── pipelines/  <span style={{ opacity:.55 }}>· 之後會放 ticket 資料</span></div>
            <div style={{ paddingLeft: 14, opacity:.85 }}>└── config.yml</div>
          </div>
        </div>

        {/* footer actions */}
        <div style={{
          padding: "12px 28px",
          borderTop: "1px solid " + hair,
          display:"flex", alignItems:"center", gap: 10,
          background: dark ? "#13161b" : "#f6efe0",
        }}>
          <span style={{ fontSize: 11, color: sub }}>Already ran?</span>
          <span className="sk" style={{
            padding:"4px 12px", fontSize: 11, fontWeight: 600,
            background: dark?"#2a2317":"#fce9c4",
            borderColor:"#c98a2a", color: dark?"#e6c890":"#5a4a1a",
            display:"inline-flex", alignItems:"center", gap: 5,
          }}>↻ Refresh</span>
          <span style={{ flex: 1 }} />
          <span className="wf-mono" style={{ fontSize: 10, color: sub, display:"inline-flex", alignItems:"center", gap: 5 }}>
            📖 docs / setup ↗
          </span>
        </div>
      </div>

      {/* bottom-left subtle hint */}
      <div style={{
        position:"absolute", left: 18, bottom: 14,
        fontSize: 10, color: sub, opacity:.6,
        display:"flex", alignItems:"center", gap: 6,
      }}>
        <span className="wf-mono">vibe-flow</span>
        <span>·</span>
        <span>所有看板 / 設定都被隱藏,直到偵測到 .tickets/</span>
      </div>
    </div>
  );
}

Object.assign(window, { InitPrompt });

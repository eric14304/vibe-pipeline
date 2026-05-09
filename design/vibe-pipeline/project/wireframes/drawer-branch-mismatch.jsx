// Drawer · Branch HEAD mismatch
// 打開的 ticket 屬於 pipeline/feat-auth,但當前 git HEAD 在 main。
// Definition 區塊上方一條 amber muted bar 警示,不擋執行。

function DrawerBranchMismatch({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#f3eede";

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 0, position:"relative", overflow:"hidden",
    }}>
      {/* 背景看板 */}
      <div style={{ position:"absolute", inset: 0, opacity: 0.35, pointerEvents:"none" }}>
        <BoardRail dark={dark} />
      </div>
      <div style={{ position:"absolute", inset: 0,
        background: dark ? "rgba(10,12,16,.55)" : "rgba(28,25,22,.18)" }} />

      {/* DRAWER */}
      <div style={{
        position:"absolute", right: 0, top: 0, bottom: 0, width: 600,
        background: dark ? "#161a20" : "#fff",
        borderLeft: "1.5px solid " + (dark ? "#d8d2c0" : "#1c1916"),
        boxShadow: dark ? "-16px 0 32px rgba(0,0,0,.45)" : "-16px 0 32px rgba(28,25,22,.12)",
        display:"flex", flexDirection:"column",
      }}>

        {/* HEADER */}
        <div style={{ padding: "14px 18px 12px", borderBottom: "1.5px solid " + hair }}>
          <div style={{ display:"flex", alignItems:"center", gap: 8, fontSize: 11, color: sub, marginBottom: 6 }}>
            <span className="wf-mono">feat-auth / iter #2</span>
            <span style={{ opacity:.4 }}>·</span>
            <span className="wf-mono">⎇ pipeline/feat-auth</span>
            <span style={{ flex: 1 }} />
            <span style={{ opacity:.5, cursor:"pointer" }}>⤢</span>
            <span style={{ opacity:.5, cursor:"pointer", fontSize: 14 }}>×</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>OAuth flow 收斂</span>
            <span className="chip" style={{
              fontSize: 10, padding:"2px 8px",
              background: dark?"#2a2317":"#f6efe0", borderColor:"transparent",
            }}>idle</span>
            <span className="chip" style={{
              fontSize: 10, padding:"2px 8px",
              background: dark?"#2a1f3a":"#e7dff2", borderColor:"transparent",
            }}>iter 4 / ∞</span>
          </div>
          <div className="wf-mono" style={{ fontSize: 10, color: sub, marginTop: 6, display:"flex", gap: 12 }}>
            <span>last run 18m ago</span>
            <span>· 3 prev iters</span>
            <span>· $1.84 spent</span>
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflow:"hidden", padding: "0 18px", display:"flex", flexDirection:"column" }}>

          {/* ⚠ Branch mismatch — amber muted bar */}
          <BranchMismatchBar dark={dark} sub={sub} hair={hair} />

          {/* Definition */}
          <Section title="Definition" defaultOpen sub={sub} hair={hair}>
            <Field label="Goal" sub={sub}>
              <span className="squig long" style={{ width: 260, height: 7 }} />
            </Field>
            <Field label="Acceptance" sub={sub}>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.7 }}>
                <li>redirect_uri 在 dev / prod 都可正常 callback</li>
                <li>strip trailing slash 不影響其他 OAuth provider</li>
                <li>新增 unit test 覆蓋兩種寫法</li>
                <li>docs/auth.md 註明此 gotcha</li>
              </ul>
            </Field>
            <Field label="Mode" sub={sub}>
              <span className="chip" style={{
                fontSize: 10, padding:"2px 8px",
                background: dark?"#2a1f3a":"#e7dff2", borderColor:"transparent",
              }}>iter mode · max 8 iterations</span>
            </Field>
          </Section>

          {/* Iter log preview (collapsed) */}
          <div style={{
            padding: "10px 0", borderTop: "1px solid " + hair,
            display:"flex", alignItems:"center", gap: 8, cursor:"pointer",
          }}>
            <span style={{ fontSize: 9, opacity:.6 }}>▸</span>
            <span className="wf-mono" style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
            }}>Iterations</span>
            <span style={{ fontSize: 11, color: sub, opacity:.7 }}>4 runs · 最後 critic verdict: needs-fix</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>展開 ▾</span>
          </div>

          {/* spacer */}
          <div style={{ flex: 1 }} />

          {/* footer action bar */}
          <div style={{
            padding: "12px 0 14px", borderTop: "1.5px solid " + hair,
            display:"flex", alignItems:"center", gap: 8,
          }}>
            <span className="sk" style={{
              padding:"6px 14px", fontSize: 12, fontWeight: 700,
              background:"#3a8a4a", color:"#fff", borderColor:"#2d6e3a",
              display:"inline-flex", alignItems:"center", gap: 6,
            }}>▶ Run iter 5</span>
            <span className="sk sk-thin" style={{
              padding:"6px 12px", fontSize: 12,
              background: dark?"#1d2025":"#fff",
            }}>↻ Re-plan</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65 }}>
              ⎇ HEAD: <span style={{ color:"#c98a2a", fontWeight: 700 }}>main</span>
              <span style={{ opacity:.4, margin:"0 4px" }}>·</span>
              ticket: <span style={{ fontWeight: 700 }}>pipeline/feat-auth</span>
            </span>
          </div>

        </div>

      </div>
    </div>
  );
}

function BranchMismatchBar({ dark, sub, hair }) {
  // muted amber, not blocking — just a hint
  const bg     = dark ? "#2a2317" : "#fce9c4";
  const accent = "#c98a2a";
  const text   = dark ? "#e6cf9e" : "#5a4a1a";

  return (
    <div style={{
      margin: "10px 0 0",
      padding: "8px 12px",
      background: bg,
      border: "1px solid " + (dark ? "#3a2d12" : "#e8c98a"),
      borderRadius: 5,
      display:"flex", alignItems:"center", gap: 10,
      fontSize: 11.5, color: text,
    }}>
      <span style={{ color: accent, fontSize: 13, lineHeight: 1 }}>⚠</span>

      <span style={{ flex: 1, lineHeight: 1.5 }}>
        此 ticket 屬於{" "}
        <span className="wf-mono" style={{
          fontWeight: 700, padding:"1px 5px", borderRadius: 2,
          background: dark?"rgba(0,0,0,.25)":"rgba(255,255,255,.55)",
        }}>pipeline/feat-auth</span>
        ,當前 HEAD 在{" "}
        <span className="wf-mono" style={{
          fontWeight: 700, padding:"1px 5px", borderRadius: 2,
          background: dark?"rgba(0,0,0,.25)":"rgba(255,255,255,.55)",
        }}>main</span>
        <span style={{ opacity:.7, marginLeft: 6 }}>· 不擋執行,僅警示</span>
      </span>

      <span className="sk sk-thin" style={{
        padding:"3px 9px", fontSize: 10.5, fontWeight: 600,
        background: dark?"#1d2025":"#fff",
        borderColor: accent, color: accent,
        display:"inline-flex", alignItems:"center", gap: 4,
      }}>
        ⎇ 切換 branch
      </span>

      <span style={{ opacity:.5, fontSize: 14, cursor:"pointer", marginLeft: 2 }}>×</span>
    </div>
  );
}

Object.assign(window, { DrawerBranchMismatch });

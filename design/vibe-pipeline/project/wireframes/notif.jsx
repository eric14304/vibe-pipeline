// Notifications — 3 variants of how blocking / important / informational are surfaced

// ── A: 三層分明 (per spec) ──
// banner 壓住 board · toast 右下 · bell popover 左上
function NotifLayered({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", position:"relative" }}>
      <NotifHeader dark={dark}>A · Banner + Toast + Bell (三層)</NotifHeader>
      {/* persistent banner */}
      <div style={{ background:"#fce9c4", color:"#5a4a1a", borderBottom: "1.5px solid #c98a2a",
        padding:"6px 12px", display:"flex", alignItems:"center", gap: 8, fontSize: 11 }}>
        <span style={{ fontSize: 13 }}>⚠</span>
        <span><b>feat-auth</b> · OAuth flow stalled (3 連續無進展) · 等介入</span>
        <span style={{ flex: 1 }} />
        <span className="sk sk-thin" style={{ padding:"2px 8px", fontSize: 10, background:"#fff" }}>檢視 →</span>
        <span style={{ opacity:.7, cursor:"pointer" }}>×</span>
      </div>
      <div style={{ background:"#f8d7d2", color:"#5a1c1c", borderBottom: "1.5px solid #b04040",
        padding:"5px 12px", display:"flex", alignItems:"center", gap: 8, fontSize: 11 }}>
        <span>🚨</span><span>每日預算硬上限 — 已暫停所有 ticket</span>
        <span style={{ flex: 1 }} />
        <span className="sk sk-thin" style={{ padding:"2px 8px", fontSize: 10, background:"#fff" }}>調整 →</span>
        <span style={{ opacity:.7 }}>×</span>
      </div>
      {/* faded board */}
      <div style={{ display:"flex", padding: 10, gap: 8, opacity:.6, flex: 1 }}>
        <FakeCol2 dark={dark} />
        <FakeCol2 dark={dark} />
        <FakeCol2 dark={dark} />
      </div>
      {/* toast (bottom-right) */}
      <div className="sk" style={{ position:"absolute", right: 12, bottom: 12, width: 220,
        padding: "8px 10px", fontSize: 11, background: dark?"#1d2025":"#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
        <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
          <span style={{ width:6, height:6, borderRadius:3, background:"#3a8a4a" }} />
          <span style={{ flex: 1, fontWeight:600 }}>refactor-api ready to merge</span>
          <span style={{ opacity:.5 }}>×</span>
        </div>
        <div className="wf-mono" style={{ fontSize: 9, opacity:.6, marginTop: 3 }}>4/4 done · 點擊檢視 →</div>
      </div>
      {/* bell popover (top-right area) */}
      <div className="sk" style={{ position:"absolute", right: 12, top: 80, width: 240,
        padding: 0, fontSize: 11, background: dark?"#1d2025":"#fff",
        boxShadow: "0 8px 24px rgba(0,0,0,.18)" }}>
        <div style={{ padding: "8px 10px", borderBottom: "1px solid " + (dark?"#3a3a40":"#dcd6c8"),
          display:"flex", alignItems:"center", gap: 6 }}>
          <span style={{ fontWeight: 700 }}>通知</span>
          <span className="sk sk-thin" style={{ padding:"1px 5px", fontSize: 9 }}>未讀 · 全部</span>
          <span style={{ flex: 1 }} />
          <span className="wf-mono" style={{ fontSize: 9, opacity:.5 }}>標記已讀</span>
        </div>
        <div style={{ padding: 4, maxHeight: 120, overflow:"hidden" }}>
          {[
            ["⚠","feat-auth stalled","2m"],
            ["🚨","budget hard cap","5m"],
            ["✓","refactor-api ready","just now"],
            ["•","新 SKILL 候選 ×2","12m"],
            ["✓","ticket #43 done","20m"],
          ].map(([ic,t,ts],i) => (
            <div key={i} style={{ padding:"5px 6px", fontSize: 10, display:"flex", gap: 6, alignItems:"center" }}>
              <span style={{ width: 14 }}>{ic}</span>
              <span style={{ flex: 1 }}>{t}</span>
              <span className="wf-mono" style={{ fontSize: 9, opacity:.5 }}>{ts}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── B: inbox-style 全集中 (像 Things / Linear inbox) ──
// 沒有 toast,只有「強制 banner」+ 一個常駐 inbox 側欄
function NotifInbox({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden" }}>
      <NotifHeader dark={dark}>B · Inbox 集中(右側永遠開)</NotifHeader>
      <div style={{ background:"#fce9c4", color:"#5a4a1a", borderBottom: "1.5px solid #c98a2a",
        padding:"5px 12px", display:"flex", alignItems:"center", gap: 8, fontSize: 11 }}>
        <span>⚠</span><span><b>feat-auth</b> stalled — 等介入</span>
        <span style={{ flex: 1 }} />
        <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 10, background:"#fff" }}>解決 →</span>
      </div>
      <div style={{ display:"flex", flex: 1, height: "calc(100% - 38px - 28px)" }}>
        <div style={{ flex: 1, padding: 10, opacity:.65, display:"flex", gap: 6 }}>
          <FakeCol2 dark={dark} /><FakeCol2 dark={dark} />
        </div>
        <div className="sk sk-thin" style={{ width: 200, borderRadius: 0, borderTop: 0, borderRight: 0, borderBottom: 0,
          padding: 0, display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"7px 10px", borderBottom:"1px solid " + (dark?"#3a3a40":"#dcd6c8"), fontSize: 11, display:"flex", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Inbox</span>
            <span className="chip" style={{ fontSize: 9 }}>5 未讀</span>
            <span style={{ flex: 1 }} />
            <span style={{ opacity:.5 }}>⚙</span>
          </div>
          <div style={{ padding: 6, overflow:"hidden", flex: 1 }}>
            <InboxRow dark={dark} severity="block" icon="⚠" text="OAuth flow stalled" sub="feat-auth · iter 6" ts="2m" />
            <InboxRow dark={dark} severity="block" icon="🚨" text="budget hard cap" sub="$5 daily 已用完" ts="5m" />
            <InboxRow dark={dark} severity="info" icon="✓" text="refactor-api ready to merge" sub="4/4 done" ts="just" unread />
            <InboxRow dark={dark} severity="info" icon="🧠" text="新 SKILL 候選 ×2" sub="從 feat-search 蒸餾" ts="12m" unread />
            <InboxRow dark={dark} severity="muted" icon="·" text="ticket #43 done" sub="docs-rewrite" ts="20m" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── C: status bar 底部 (VSCode 風) + 嚴重事件才彈 ──
function NotifStatusBar({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", display:"flex", flexDirection:"column" }}>
      <NotifHeader dark={dark}>C · 底部 status bar (低干擾)</NotifHeader>
      <div style={{ display:"flex", flex: 1, padding: 10, gap: 6 }}>
        <FakeCol2 dark={dark} /><FakeCol2 dark={dark} /><FakeCol2 dark={dark} />
      </div>
      {/* 嚴重 — 唯一彈出 */}
      <div className="sk" style={{ marginLeft: "auto", marginRight: 12, marginBottom: 26,
        width: 240, padding: "8px 10px", fontSize: 11,
        background: "#fff5e0", borderColor: "#c98a2a", borderWidth: 2,
        boxShadow: "0 8px 24px rgba(201,138,42,.25)" }}>
        <div style={{ display:"flex", alignItems:"center", gap: 6, fontWeight: 700, color:"#5a4a1a" }}>
          <span>⚠</span><span>OAuth flow stalled</span>
        </div>
        <div className="wf-mono" style={{ fontSize: 9, opacity:.7, marginTop: 3, color:"#5a4a1a" }}>feat-auth · iter 6 · 等介入</div>
        <div style={{ display:"flex", gap: 4, marginTop: 6 }}>
          <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 10, background:"#fff" }}>檢視</span>
          <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 10, background:"#fff" }}>稍後</span>
        </div>
      </div>
      {/* status bar */}
      <div style={{ height: 22, background: dark?"#0e1116":"#1c1916", color:"#e7e3d8",
        display:"flex", alignItems:"center", padding:"0 10px", gap: 12, fontSize: 10 }}>
        <span style={{ display:"flex", alignItems:"center", gap: 4 }}>⎇ main</span>
        <span style={{ display:"flex", alignItems:"center", gap: 4, color:"#fce9c4" }}>⚠ 1 stalled</span>
        <span style={{ display:"flex", alignItems:"center", gap: 4, color:"#f8d7d2" }}>🚨 budget cap</span>
        <span style={{ flex: 1 }} />
        <span style={{ display:"flex", alignItems:"center", gap: 4, color:"#d8ecd8" }}>✓ 1 ready</span>
        <span style={{ opacity:.55 }} className="wf-mono">3 running · $3.40 / $5</span>
        <span>🔔 3</span>
      </div>
    </div>
  );
}

function NotifHeader({ dark, children }) {
  return (
    <div className="wf-hand" style={{ fontSize: 14, fontWeight: 700, padding: "10px 12px",
      borderBottom: "1.5px solid " + (dark?"#3a3a40":"#1c1916") }}>{children}</div>
  );
}
function FakeCol2({ dark }) {
  return (
    <div className="sk sk-thin" style={{ width: 130, flexShrink: 0, padding: 0 }}>
      <div style={{ padding:"5px 7px", fontSize: 10, fontWeight: 700, borderBottom: "1px solid " + (dark?"#3a3a40":"#1c1916") }}>
        <span className="squig med" style={{ width: 70, height: 6 }} />
      </div>
      <div style={{ padding: 5, display:"flex", flexDirection:"column", gap: 4 }}>
        {["green","amber","blue","gray"].map((c, i) => (
          <div key={i} className="sk sk-thin" style={{ padding:"4px 5px 4px 8px", position:"relative", height: 18 }}>
            <span className={"band band-" + c} style={{ width: 3 }} />
            <span className="squig short" style={{ width: 50 - i*5, height: 5 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
function InboxRow({ dark, severity, icon, text, sub, ts, unread }) {
  const bg = severity === "block" ? (dark?"#3a2d12":"#fff5e0") : "transparent";
  const bd = severity === "block" ? "#c98a2a" : "transparent";
  return (
    <div className="sk sk-thin" style={{
      padding:"5px 7px", marginBottom: 4, fontSize: 10,
      background: bg, borderColor: bd,
      opacity: severity==="muted"?.65:1,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <span style={{ width: 12 }}>{icon}</span>
        <span style={{ flex: 1, fontWeight: unread ? 700 : 500 }}>{text}</span>
        {unread && <span style={{ width: 5, height: 5, borderRadius: 3, background:"#3a6fb0" }} />}
      </div>
      <div className="wf-mono" style={{ fontSize: 9, opacity:.55, marginTop: 2, paddingLeft: 18, display:"flex", gap: 6 }}>
        <span style={{ flex: 1 }}>{sub}</span><span>{ts}</span>
      </div>
    </div>
  );
}

Object.assign(window, { NotifLayered, NotifInbox, NotifStatusBar });

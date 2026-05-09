// 通知系統 B · Inbox 集中側欄 — 背後改用 1 · BoardRail
// (覆寫 wireframes/notif.jsx 的 NotifInbox,但只在 v2 收斂版用)

function NotifInboxOnRail({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", position:"relative" }}>
      {/* 1) 背後:整張 BoardRail */}
      <div style={{ position:"absolute", inset: 0 }}>
        <BoardRail dark={dark} />
      </div>

      {/* 2) 上方持續 banner(阻斷型 — 壓在 TopBar 下) */}
      <div style={{
        position:"absolute", left: 0, right: 0, top: 48,
        background:"#fce9c4", color:"#5a4a1a",
        borderBottom: "1.5px solid #c98a2a",
        padding:"5px 12px", display:"flex", alignItems:"center", gap: 8, fontSize: 11,
        zIndex: 2,
      }}>
        <span>⚠</span>
        <span><b>feat-auth</b> stalled — 等介入</span>
        <span style={{ flex: 1 }} />
        <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 10, background:"#fff" }}>解決 →</span>
      </div>

      {/* 3) 右側 Inbox 永駐側欄(蓋住 BoardRail 的右邊) */}
      <div className="sk sk-thin" style={{
        position:"absolute", right: 0, top: 48 + 26, bottom: 0, width: 220,
        borderRadius: 0, borderTop: 0, borderRight: 0, borderBottom: 0,
        background: dark ? "#1d2025" : "#fbf8f1",
        padding: 0, display:"flex", flexDirection:"column", zIndex: 2,
        boxShadow: dark ? "-12px 0 24px rgba(0,0,0,.35)" : "-12px 0 24px rgba(28,25,22,.08)",
      }}>
        <div style={{
          padding:"7px 10px",
          borderBottom:"1px solid " + (dark?"#3a3a40":"#dcd6c8"),
          fontSize: 11, display:"flex", gap: 6, alignItems:"center",
        }}>
          <span style={{ fontWeight: 700 }}>Inbox</span>
          <span className="chip" style={{ fontSize: 9 }}>5 未讀</span>
          <span style={{ flex: 1 }} />
          <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>標記已讀</span>
          <span style={{ opacity:.5 }}>⚙</span>
        </div>
        <div style={{ padding: 6, overflow:"hidden", flex: 1 }}>
          <InboxRow dark={dark} severity="block" icon="⚠" text="OAuth flow stalled" sub="feat-auth · iter 6"  ts="2m"   unread />
          <InboxRow dark={dark} severity="block" icon="🚨" text="budget hard cap"   sub="$5 daily 已用完"    ts="5m"   unread />
          <InboxRow dark={dark} severity="info"  icon="✓" text="refactor-api ready" sub="4/4 done"          ts="just" unread />
          <InboxRow dark={dark} severity="info"  icon="🧠" text="新 SKILL 候選 ×2"   sub="從 feat-search 蒸餾" ts="12m"  unread />
          <InboxRow dark={dark} severity="muted" icon="·" text="ticket #43 done"    sub="docs-rewrite"      ts="20m" />
          <InboxRow dark={dark} severity="muted" icon="·" text="perf-db iter 1 done" sub="2/4 done"         ts="34m" />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NotifInboxOnRail, NotifInboxStrip });

// ── Inbox · 折疊 strip(右側 ~40px) ──────────────────────────
function NotifInboxStrip({ dark }) {
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const amberBg = dark ? "#3a2d12" : "#fce9c4";
  const amberFg = dark ? "#e6c890" : "#5a4a1a";

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", position:"relative" }}>
      {/* 背景 BoardRail */}
      <div style={{ position:"absolute", inset: 0 }}>
        <BoardRail dark={dark} />
      </div>

      {/* 上方持續 banner */}
      <div style={{
        position:"absolute", left: 0, right: 40, top: 48,
        background:"#fce9c4", color:"#5a4a1a",
        borderBottom: "1.5px solid #c98a2a",
        padding:"5px 12px", display:"flex", alignItems:"center", gap: 8, fontSize: 11,
        zIndex: 2,
      }}>
        <span>⚠</span>
        <span><b>feat-auth</b> stalled — 等介入</span>
        <span style={{ flex: 1 }} />
        <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 10, background:"#fff" }}>解決 →</span>
      </div>

      {/* 右側 strip */}
      <div className="sk sk-thin" style={{
        position:"absolute", right: 0, top: 48, bottom: 0, width: 40,
        borderRadius: 0, borderTop: 0, borderRight: 0, borderBottom: 0,
        background: dark ? "#13161b" : "#f3eede",
        display:"flex", flexDirection:"column", alignItems:"center",
        padding: "10px 0", gap: 12, zIndex: 2,
        boxShadow: dark ? "-6px 0 16px rgba(0,0,0,.35)" : "-6px 0 16px rgba(28,25,22,.06)",
      }}>
        {/* expand-up 箭頭 */}
        <div title="展開" style={{
          width: 24, height: 24, borderRadius: 3,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize: 14, color: sub, cursor:"pointer",
          border: "1px solid " + hair, background: dark?"#1d2025":"#fff",
        }}>‹</div>

        {/* unread count 大字 */}
        <div style={{
          width: 28, padding: "8px 0", textAlign:"center",
          background: dark?"#1d2025":"#fff",
          border: "1.5px solid " + (dark?"#d8d2c0":"#1c1916"),
          borderRadius: 4,
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>5</div>
          <div className="wf-mono" style={{
            fontSize: 7.5, color: sub, marginTop: 3,
            writingMode:"vertical-rl", textOrientation:"mixed", letterSpacing: 1,
          }}>UNREAD</div>
        </div>

        {/* 最近阻斷型 icon */}
        <div title="OAuth flow stalled · 2m ago" style={{
          width: 28, height: 28, borderRadius: 4,
          background: amberBg, color: amberFg,
          border: "1.5px solid #c98a2a",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize: 13, fontWeight: 700,
          position: "relative",
        }}>
          ⚠
          {/* pulse dot indicating new */}
          <span className="pulse" style={{
            position:"absolute", top: -3, right: -3,
            width: 8, height: 8, borderRadius: 4,
            background: "#b04040", border:"1.5px solid " + (dark?"#13161b":"#f3eede"),
          }} />
        </div>

        {/* tiny status pips — 顯示 inbox 內容輪廓 */}
        <div style={{ display:"flex", flexDirection:"column", gap: 5, alignItems:"center", marginTop: 2 }}>
          <span title="block · budget cap" className="pip pip-r" style={{ width: 7, height: 7 }} />
          <span title="info · refactor-api ready" className="pip pip-g" style={{ width: 7, height: 7 }} />
          <span title="info · 新 SKILL 候選" className="pip pip-a" style={{ width: 7, height: 7 }} />
          <span title="muted · ticket #43 done" className="pip pip-d" style={{ width: 7, height: 7, opacity:.5 }} />
          <span title="muted · perf-db iter done" className="pip pip-d" style={{ width: 7, height: 7, opacity:.5 }} />
        </div>

        <div style={{ flex: 1 }} />

        {/* expand-down 箭頭 */}
        <div title="展開 inbox" style={{
          width: 24, height: 24, borderRadius: 3,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize: 14, color: sub, cursor:"pointer",
          border: "1px solid " + hair, background: dark?"#1d2025":"#fff",
        }}>›</div>

        {/* tiny vertical label */}
        <div className="wf-mono" style={{
          fontSize: 8.5, color: sub, opacity: .65,
          writingMode:"vertical-rl", textOrientation:"mixed",
          letterSpacing: 1.5, paddingTop: 4,
        }}>INBOX</div>
      </div>
    </div>
  );
}

// Ticket creation Q&A flow — 3 variations
// Different interaction models for the AI-assisted creation drawer

// ── Variant A: chat-dominant + draft sidebar (per spec) ──
// Q&A 在主視區占大部分,右側 sticky draft 欄位即時填入
function QAChatSide({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", display:"flex", flexDirection:"column" }}>
      <QAHeader dark={dark}>A · Chat 主導 + Draft 側欄</QAHeader>
      <div style={{ display:"flex", flex: 1, minHeight: 0 }}>
        {/* chat */}
        <div style={{ flex: 1.6, padding: 12, display:"flex", flexDirection:"column", gap: 8, overflow:"hidden", borderRight: "1.5px solid " + (dark?"#3a3a40":"#1c1916") }}>
          <Bubble dark={dark} from="ai">想做什麼?簡單描述就好。</Bubble>
          <Bubble dark={dark} from="me">使用者用 google / github 登入,session 存在 cookie</Bubble>
          <Bubble dark={dark} from="ai">先做哪個 provider?還是兩個並行?</Bubble>
          <div style={{ display:"flex", gap: 6, paddingLeft: 28 }}>
            <QuickReply dark={dark}>都做</QuickReply>
            <QuickReply dark={dark}>先 google</QuickReply>
            <QuickReply dark={dark}>先 github</QuickReply>
          </div>
          <Bubble dark={dark} from="me">先 google,github 之後加</Bubble>
          <Bubble dark={dark} from="ai">需要記住「上次登入哪個 provider」做 UX 提示嗎?</Bubble>
          <div style={{ flex: 1 }} />
          <div className="sk sk-thin" style={{ display:"flex", alignItems:"center", padding: "6px 10px", gap: 6 }}>
            <span style={{ flex: 1, fontSize: 10, opacity: .5 }}>▌</span>
            <span style={{ opacity:.5, fontSize: 10 }}>↵</span>
          </div>
        </div>
        {/* draft */}
        <div style={{ flex: 1, padding: 12, overflow: "hidden", display:"flex", flexDirection:"column", gap: 8 }}>
          <div className="wf-mono" style={{ fontSize: 9, opacity: .55 }}>DRAFT (AI 填入中)</div>
          <DraftField dark={dark} label="title" filled value="Google OAuth 登入" highlight />
          <DraftField dark={dark} label="goal" filled value="使用者用 Google 帳號登入,session cookie 維持 7 天" />
          <DraftField dark={dark} label="acceptance" filled multi value={["[ ] /auth/google redirect", "[ ] callback 寫 session", "[ ] me endpoint 回傳 user"]} highlight />
          <DraftField dark={dark} label="mode" filled value="step (單次完成)" />
          <DraftField dark={dark} label="doer / critic" empty value="(等資訊)" />
          <div style={{ flex: 1 }} />
          <div style={{ display:"flex", gap: 6 }}>
            <span className="sk sk-thin" style={{ padding:"3px 8px", fontSize: 10, opacity:.6 }}>跳過 Q&A</span>
            <span style={{ flex: 1 }} />
            <span className="sk sk-thin" style={{ padding:"3px 8px", fontSize: 10, opacity:.4 }}>Save (尚不可)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Variant B: form-first + AI 副駕駛 (drawer 樣貌) ──
// 表單為主,Q&A 是底部「AI 教練」浮條,提示下一個該填哪格
function QAFormFirst({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", display:"flex", flexDirection:"column" }}>
      <QAHeader dark={dark}>B · Form-first + AI 副駕駛</QAHeader>
      <div style={{ flex: 1, padding: 14, overflow: "hidden" }}>
        <DraftField dark={dark} label="title" filled value="Google OAuth 登入" />
        <div style={{ height: 8 }} />
        <DraftField dark={dark} label="goal" filled multi value={["使用者用 Google 帳號登入,session cookie 維持 7 天"]} />
        <div style={{ height: 8 }} />
        <DraftField dark={dark} label="acceptance criteria" filled multi value={["[ ] /auth/google redirect", "[ ] callback 寫 session", "[ ] me endpoint 回傳 user"]} highlight />
        <div style={{ height: 8 }} />
        <div style={{ display:"flex", gap: 8 }}>
          <div style={{ flex: 1 }}><DraftField dark={dark} label="mode" filled value="step" /></div>
          <div style={{ flex: 1 }}><DraftField dark={dark} label="doer" empty value="claude-sonnet (default)" /></div>
        </div>
      </div>
      {/* AI coach bar */}
      <div className="sk sk-thin sk-fill-purple" style={{ borderRadius: 0, borderLeft: 0, borderRight: 0, borderBottom: 0,
        padding: "8px 12px", display:"flex", alignItems:"center", gap: 8, fontSize: 11 }}>
        <span style={{ width:18, height:18, borderRadius:9, background: dark?"#5a4a8a":"#9a82c2", color:"#fff",
          display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>AI</span>
        <span style={{ flex: 1, fontStyle:"italic" }}>「需要登出端點嗎?要不要記住上次 provider?」</span>
        <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 9, background: dark?"#1d2025":"#fff" }}>要</span>
        <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 9, background: dark?"#1d2025":"#fff" }}>不要</span>
        <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 9, background: dark?"#1d2025":"#fff" }}>跳過</span>
      </div>
    </div>
  );
}

// ── Variant C: progressive disclosure — 一次一題,大字置中 ──
// onboarding 風格,類 Linear "Create issue" + Typeform
function QAStepwise({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", display:"flex", flexDirection:"column" }}>
      <QAHeader dark={dark}>C · Stepwise (大字一次一題)</QAHeader>
      <div style={{ flex: 1, display:"flex", flexDirection:"column", padding: 16, gap: 12 }}>
        {/* progress dots */}
        <div style={{ display:"flex", gap: 4, alignItems:"center" }}>
          <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>3 / 7</span>
          <span style={{ flex:1, height: 3, background: dark?"#3a3a40":"#dcd6c8", borderRadius: 2, overflow:"hidden" }}>
            <span style={{ display:"block", width:"43%", height:"100%", background:"#9a82c2" }} />
          </span>
          <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>~2 min left</span>
        </div>
        <div style={{ flex: 1, display:"flex", flexDirection:"column", justifyContent:"center", gap: 14, padding: "0 12px" }}>
          <div className="wf-mono" style={{ fontSize: 9, opacity: .55 }}>Q3 — 驗收條件</div>
          <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3 }}>
            登入成功的判定是什麼?
          </div>
          <div style={{ fontSize: 11, opacity: .65, lineHeight: 1.5 }}>
            盡量具體,例如:能 redirect 回 / · /me 回正確 user · cookie 有 7 天
          </div>
          <div className="sk sk-thin" style={{ padding: 8, minHeight: 70, fontSize: 11, lineHeight: 1.5 }}>
            <span className="wf-mono" style={{ opacity:.5 }}>▌</span>
          </div>
          {/* 之前 Q 摘要 */}
          <div className="sk sk-thin sk-fill-mute" style={{ padding: "8px 10px", fontSize: 10, lineHeight: 1.5 }}>
            <div className="wf-mono" style={{ fontSize: 9, opacity: .55, marginBottom: 4 }}>前面回答了…</div>
            <div>· title: <b>Google OAuth 登入</b></div>
            <div>· goal: 使用者用 Google 帳號登入</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
          <span className="sk sk-thin" style={{ padding:"4px 10px", fontSize: 10 }}>← 上一題</span>
          <span style={{ flex: 1 }} />
          <span className="wf-mono" style={{ fontSize: 9, opacity:.5 }}>shift+enter 換行</span>
          <span className="sk sk-thin sk-fill-purple" style={{ padding:"4px 12px", fontSize: 10, fontWeight:600 }}>下一題 ↵</span>
        </div>
      </div>
    </div>
  );
}

function QAHeader({ dark, children }) {
  return (
    <div style={{ padding: "10px 12px", borderBottom: "1.5px solid " + (dark?"#3a3a40":"#1c1916"),
      background: dark?"#181b21":"#f3eede", display:"flex", alignItems:"center", gap: 8 }}>
      <span className="wf-hand" style={{ fontSize: 14, fontWeight: 700 }}>{children}</span>
      <span style={{ flex: 1 }} />
      <span className="chip wf-mono" style={{ fontSize: 9 }}>pipeline/feat-auth</span>
      <span style={{ opacity:.5 }}>×</span>
    </div>
  );
}
function Bubble({ dark, from, children }) {
  const ai = from === "ai";
  return (
    <div style={{ display:"flex", gap: 6, alignItems:"flex-start", justifyContent: ai?"flex-start":"flex-end" }}>
      {ai && <span style={{ width:22, height:22, borderRadius:11, background: dark?"#5a4a8a":"#9a82c2", color:"#fff",
        display:"flex", alignItems:"center", justifyContent:"center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>AI</span>}
      <div className="sk sk-thin" style={{
        padding:"6px 9px", fontSize: 11, maxWidth: "78%",
        background: ai ? (dark?"#2a1f3a":"#e7dff2") : (dark?"#2a2a30":"#fff"),
        borderColor: ai ? "transparent" : (dark?"#3a3a40":"#1c1916"),
      }}>{children}</div>
    </div>
  );
}
function QuickReply({ dark, children }) {
  return <span className="sk sk-thin" style={{ padding:"2px 8px", fontSize: 10, background: dark?"#1d2025":"#fff" }}>{children}</span>;
}
function DraftField({ dark, label, value, multi, filled, empty, highlight }) {
  return (
    <div className="sk sk-thin" style={{
      padding:"6px 9px", fontSize: 10, lineHeight: 1.4,
      background: highlight ? (dark?"#3a2d12":"#fce9c4") : empty ? (dark?"#20232a":"#efeae0") : (dark?"#1d2025":"#fff"),
      borderColor: highlight ? "#c98a2a" : empty ? (dark?"#3a3a40":"#bfbaa8") : undefined,
    }}>
      <div className="wf-mono" style={{ fontSize: 9, opacity:.55, marginBottom: 3 }}>{label}{highlight && " ← AI 剛填"}</div>
      {Array.isArray(value) ? value.map((v,i) => <div key={i}>{v}</div>) : (
        <div style={{ opacity: empty?.55:1, fontStyle: empty?"italic":"normal" }}>{value}</div>
      )}
    </div>
  );
}

Object.assign(window, { QAChatSide, QAFormFirst, QAStepwise });

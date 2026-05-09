// Settings modal · SKILL tab
function SettingsSkill({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#f3eede";
  const modalBg = dark ? "#161a20" : "#fbf8f1";
  const sideBg = dark ? "#13161b" : "#f3eede";

  const tabs = [
    { id:"general",  label:"General",   icon:"⚙" },
    { id:"models",   label:"Models",    icon:"◌" },
    { id:"budget",   label:"Budget",    icon:"$" },
    { id:"skills",   label:"Skills",    icon:"✦", active: true, count: 12, badge: 2 },
    { id:"hooks",    label:"Hooks",     icon:"⎌" },
    { id:"keys",     label:"API keys",  icon:"⚿" },
    { id:"members",  label:"Members",   icon:"⌾" },
  ];

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 0, position:"relative", overflow:"hidden",
      display:"flex", justifyContent:"center", alignItems:"center",
    }}>
      {/* backdrop */}
      <div style={{ position:"absolute", inset: 0,
        background: dark ? "rgba(10,12,16,.65)" : "rgba(28,25,22,.32)" }} />

      {/* MODAL */}
      <div style={{
        position:"relative", width: 980, height: 660,
        background: modalBg, color: fg,
        border: "1.5px solid " + (dark?"#d8d2c0":"#1c1916"),
        borderRadius: 8,
        boxShadow: dark ? "0 24px 64px rgba(0,0,0,.55)" : "0 24px 64px rgba(28,25,22,.18)",
        display:"flex", overflow:"hidden",
      }}>
        {/* SIDE TABS */}
        <div style={{
          width: 180, background: sideBg, borderRight: "1px solid " + hair,
          padding: "16px 8px", display:"flex", flexDirection:"column", gap: 2,
        }}>
          <div className="wf-mono" style={{
            fontSize: 9, opacity:.55, padding:"4px 10px 8px",
            fontWeight: 700, letterSpacing: 1,
          }}>SETTINGS</div>
          {tabs.map(tab => (
            <div key={tab.id} style={{
              padding: "7px 10px", borderRadius: 4, fontSize: 11.5,
              display:"flex", alignItems:"center", gap: 8,
              background: tab.active ? (dark?"#1d2025":"#fff") : "transparent",
              border: "1px solid " + (tab.active ? hair : "transparent"),
              fontWeight: tab.active ? 700 : 500,
              cursor:"pointer",
            }}>
              <span style={{ width: 14, opacity: tab.active?1:.65 }}>{tab.icon}</span>
              <span style={{ flex: 1 }}>{tab.label}</span>
              {tab.count != null && <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>{tab.count}</span>}
              {tab.badge ? <span style={{
                fontSize: 9, fontWeight: 700, padding:"1px 6px",
                background:"#c98a2a", color:"#fff", borderRadius: 9,
              }}>{tab.badge}</span> : null}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div className="wf-mono" style={{ fontSize: 9, opacity:.5, padding:"4px 10px" }}>v0.4.2 · 本機</div>
        </div>

        {/* CONTENT */}
        <div style={{ flex: 1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          {/* Top bar */}
          <div style={{
            padding: "14px 22px",
            borderBottom: "1.5px solid " + hair,
            display:"flex", alignItems:"center", gap: 10,
          }}>
            <span style={{ fontSize: 16, fontWeight: 700 }}>Skills</span>
            <span className="wf-mono" style={{ fontSize: 10, color: sub }}>· 12 active · 2 候選</span>
            <span style={{ flex: 1 }} />
            <span className="sk sk-thin" style={{
              padding:"4px 9px", fontSize: 10, background: dark?"#1d2025":"#fff",
              display:"inline-flex", alignItems:"center", gap: 5,
            }}>🔍 search</span>
            <span style={{ opacity:.5, cursor:"pointer", fontSize: 16 }}>×</span>
          </div>

          {/* TOP HALF — current SKILL.md preview */}
          <div style={{
            flex: "0 0 auto", padding: "14px 22px",
            borderBottom: "1.5px solid " + hair,
            maxHeight: 320, display:"flex", flexDirection:"column",
          }}>
            <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 8 }}>
              <span className="wf-mono" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform:"uppercase", color: sub,
              }}>Current SKILL.md</span>
              <span className="chip" style={{ fontSize: 9, padding:"1px 6px" }}>active</span>
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65 }}>
                .vibe-flow/skills/SKILL.md · 4.2 KB · 3 sections
              </span>
              <span style={{ flex: 1 }} />
              <span className="sk sk-thin" style={{
                padding:"4px 9px", fontSize: 10.5, background: dark?"#1d2025":"#fff",
                display:"inline-flex", alignItems:"center", gap: 5,
              }}>✎ Edit raw</span>
              <span className="sk sk-thin" style={{
                padding:"4px 9px", fontSize: 10.5, background: dark?"#1d2025":"#fff",
              }}>history</span>
            </div>

            {/* markdown render */}
            <div style={{
              flex: 1, padding: "12px 16px",
              background: dark?"#1a1d23":"#fff",
              border: "1px solid " + hair, borderRadius: 4,
              overflow:"hidden", position:"relative",
              fontSize: 11.5, lineHeight: 1.55,
            }}>
              <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}># vibe-flow project skills</div>
              <div style={{ color: sub, marginBottom: 10 }}>
                專案累積的 doer / critic 慣例,自動注入 prompt header。
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>## Code 風格</div>
              <ul style={{ margin: 0, paddingLeft: 20, marginBottom: 8 }}>
                <li>所有新 module 用 TypeScript strict;不要 <code>any</code></li>
                <li>error 一律 throw 自定 class,不要丟 <code>Error</code> 字串</li>
                <li>檔名 kebab-case,React component PascalCase</li>
              </ul>

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>## Test</div>
              <ul style={{ margin: 0, paddingLeft: 20, marginBottom: 8 }}>
                <li>每個 PR 至少新增 1 個 unit test</li>
                <li>e2e 用 Playwright,不要 selenium</li>
              </ul>

              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>## Critic 規則</div>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>同一段 diff 連續兩輪幾乎相同 → 自動 paus…</li>
              </ul>

              {/* fade out */}
              <div style={{
                position:"absolute", left:0, right:0, bottom: 0, height: 32,
                background: `linear-gradient(transparent, ${dark?"#1a1d23":"#fff"})`,
                pointerEvents:"none",
              }} />
            </div>
          </div>

          {/* BOTTOM HALF — candidates */}
          <div style={{ flex: 1, padding: "14px 22px", overflow:"hidden", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 10 }}>
              <span className="wf-mono" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform:"uppercase", color: sub,
              }}>候選 SKILL · 從近期 pipeline 蒸餾</span>
              <span style={{
                fontSize: 9, fontWeight: 700, padding:"1px 6px",
                background:"#c98a2a", color:"#fff", borderRadius: 9,
              }}>2</span>
              <span style={{ flex: 1 }} />
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65 }}>auto-distill: on · 每天 18:00</span>
            </div>

            <div style={{
              display:"grid", gridTemplateColumns:"1fr 1fr", gap: 10,
              flex: 1, overflow:"hidden",
            }}>
              <SkillCandidateCard
                source="feat-search"
                seenIn="iter 4 重複出現"
                title="搜尋 ranking:用 BM25 + recency boost"
                preview={`## Search ranking
新 ranking 預設組合:
- 70% BM25
- 30% recency (decay = 7d)
- 不加機器學習層,除非 PR 特別說明`}
                accent="#c98a2a"
                dark={dark} sub={sub} hair={hair} codeBg={codeBg}
                ts="蒸餾於 18m 前"
              />
              <SkillCandidateCard
                source="refactor-api"
                seenIn="3 個 ticket 都用"
                title="error mapping:throw OAuth/HttpError 子類"
                preview={`## Error 映射
- OAuth 失敗 → throw OAuthError(code, raw)
- HTTP 4xx → throw HttpClientError
- HTTP 5xx → throw HttpServerError
caller 用 instanceof 處理`}
                accent="#3a6fb0"
                dark={dark} sub={sub} hair={hair} codeBg={codeBg}
                ts="蒸餾於 2h 前"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillCandidateCard({ source, seenIn, title, preview, accent, dark, sub, hair, codeBg, ts }) {
  return (
    <div className="sk sk-thin" style={{
      padding: 0, display:"flex", flexDirection:"column",
      background: dark ? "#1a1d23" : "#fff",
      borderColor: hair,
      overflow:"hidden",
    }}>
      {/* header */}
      <div style={{
        padding: "8px 12px", borderBottom: "1px solid " + hair,
        display:"flex", alignItems:"center", gap: 6, fontSize: 11,
        background: dark ? "#161a20" : "#fbf8f1",
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: 3, background: accent,
        }} />
        <span style={{ fontWeight: 700, fontSize: 11 }}>來自 <span className="wf-mono" style={{ color: accent }}>{source}</span></span>
        <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7 }}>· {seenIn}</span>
        <span style={{ flex: 1 }} />
        <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.55 }}>{ts}</span>
      </div>

      {/* title */}
      <div style={{ padding: "8px 12px 4px", fontSize: 12, fontWeight: 700 }}>{title}</div>

      {/* preview */}
      <div className="wf-mono" style={{
        margin: "4px 12px 8px", padding: 8,
        background: codeBg, border: "1px solid " + hair, borderRadius: 3,
        fontSize: 10, lineHeight: 1.5, whiteSpace:"pre-wrap",
        flex: 1, overflow:"hidden", position:"relative",
      }}>
        {preview}
        <div style={{
          position:"absolute", left:0, right:0, bottom: 0, height: 18,
          background: `linear-gradient(transparent, ${codeBg})`, pointerEvents:"none",
        }} />
      </div>

      {/* actions */}
      <div style={{
        padding: "8px 12px",
        borderTop: "1px solid " + hair,
        display:"flex", gap: 6,
        background: dark ? "#161a20" : "#fbf8f1",
      }}>
        <span className="sk" style={{
          padding:"5px 10px", fontSize: 10.5, fontWeight: 600,
          background:"#3a8a4a", color:"#fff", borderColor:"#2d6e3a",
          flex: 1, textAlign:"center",
        }}>✓ Approve</span>
        <span className="sk sk-thin" style={{
          padding:"5px 10px", fontSize: 10.5,
          background: dark?"#1d2025":"#fff",
          flex: 1, textAlign:"center",
        }}>✎ Edit then approve</span>
        <span className="sk sk-thin" style={{
          padding:"5px 10px", fontSize: 10.5,
          background: dark?"#1d2025":"#fff",
          color:"#b04040", borderColor:"#b04040",
          textAlign:"center",
        }}>✕</span>
      </div>
    </div>
  );
}

Object.assign(window, { SettingsSkill });

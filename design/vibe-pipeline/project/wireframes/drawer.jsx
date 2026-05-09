// Ticket drawer wireframes
// 起頭:Drawer · View mode (已完成的 step ticket)

function DrawerStepDone({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#f3eede";

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 0, position:"relative", overflow:"hidden",
    }}>
      {/* 背景 — 淡化的 BoardRail,讓 drawer 從右側貼上來 */}
      <div style={{ position:"absolute", inset: 0, opacity: 0.35, pointerEvents:"none" }}>
        <BoardRail dark={dark} />
      </div>
      {/* 半透明遮罩 */}
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
        <div style={{
          padding: "14px 18px 12px",
          borderBottom: "1.5px solid " + hair,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap: 8, fontSize: 11, color: sub, marginBottom: 6 }}>
            <span className="wf-mono">feat-auth / step #1</span>
            <span style={{ opacity:.4 }}>·</span>
            <span className="wf-mono">⎇ pipeline/feat-auth</span>
            <span style={{ flex: 1 }} />
            <span style={{ opacity:.5, cursor:"pointer" }}>⤢</span>
            <span style={{ opacity:.5, cursor:"pointer", fontSize: 14 }}>×</span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>DB schema 設計</span>
            <span className="chip" style={{
              fontSize: 10, color:"#3a8a4a", borderColor:"#3a8a4a",
              background: dark ? "#1f3320" : "#d8ecd8",
              padding:"2px 8px", fontWeight: 600,
            }}>● done</span>
            <span className="chip" style={{ fontSize: 10, padding:"2px 8px" }}>step</span>
          </div>
          <div className="wf-mono" style={{ fontSize: 10, color: sub, marginTop: 6, display:"flex", gap: 12 }}>
            <span>completed 12m ago</span>
            <span>· duration 12:04</span>
            <span>· cost $0.42</span>
            <span>· tokens 8.4k</span>
          </div>
        </div>

        {/* BODY (scrollable) */}
        <div style={{ flex: 1, overflow:"hidden", padding: "0 18px" }}>
          {/* Definition (expanded) */}
          <Section title="Definition" defaultOpen sub={sub} hair={hair}>
            <Field label="Goal" sub={sub}>
              <span className="squig long" style={{ width: 260, height: 7 }} />
              <span className="squig long" style={{ width: 200, height: 7 }} />
              <span className="squig med"  style={{ width: 140, height: 7 }} />
            </Field>

            <Field label="Acceptance criteria" sub={sub}>
              {[
                "users / sessions / oauth_accounts table 設計完成",
                "包含 indexes 與 cascade 規則",
                "migration 檔可以 up / down",
                "schema 通過 lint + review",
              ].map((t,i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap: 8, fontSize: 11, padding:"4px 0" }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: "#3a8a4a",
                    color: "#fff", fontSize: 10, fontWeight: 700,
                    display:"inline-flex", alignItems:"center", justifyContent:"center",
                    flexShrink: 0, marginTop: 1,
                  }}>✓</span>
                  <span>{t}</span>
                </div>
              ))}
              <div className="wf-mono" style={{ fontSize: 9, color: sub, marginTop: 4, paddingLeft: 22 }}>
                4 / 4 通過 · 由 critic 在 iter 1 確認
              </div>
            </Field>

            <Field label="Doer" sub={sub}>
              <KV k="model"       v="claude-sonnet-4.5" mono />
              <KV k="tools"       v="[ read_file, write_file, run_sql ]" mono />
              <KV k="cwd"         v="~/code/vibe-flow" mono />
              <KV k="max_tokens"  v="8000" mono />
              <KV k="timeout"     v="900s" mono />
            </Field>

            <Field label="Prompt template" sub={sub} collapsible defaultOpen={false} hair={hair}>
              <div className="wf-mono" style={{
                fontSize: 10, lineHeight: 1.5,
                background: codeBg, color: fg,
                padding: 10, borderRadius: 4,
                border: "1px solid " + hair,
                whiteSpace:"pre-wrap",
              }}>
{`你是負責 schema 設計的 doer。
讀取 ${"`"}{{ context.repo }}${"`"} 後,根據以下 goal 產出 SQL migration:

GOAL:
{{ goal }}

AC:
{{#each ac}} - {{this}}
{{/each}}

…`}
              </div>
            </Field>
          </Section>

          {/* Output / artifacts */}
          <Section title="Output" defaultOpen sub={sub} hair={hair}>
            <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
              <FileRow icon="📄" name="migrations/0007_auth_schema.up.sql"   meta="+128 −0" />
              <FileRow icon="📄" name="migrations/0007_auth_schema.down.sql" meta="+22 −0" />
              <FileRow icon="📝" name="docs/schema/auth.md"                  meta="+56 −0" />
            </div>
          </Section>

          {/* No iteration history block — step 只跑一次 */}
          <div style={{
            padding: "10px 12px", marginTop: 6, marginBottom: 16,
            border: "1px dashed " + hair, borderRadius: 6,
            fontSize: 10, color: sub,
            display:"flex", alignItems:"center", gap: 8,
          }}>
            <span style={{ opacity:.7 }}>ℹ</span>
            <span>Step ticket — 只跑一次,沒有 iteration history。</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ opacity:.7 }}>切換為 iter →</span>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          borderTop: "1.5px solid " + hair,
          padding: "10px 18px",
          display:"flex", alignItems:"center", gap: 10,
          background: dark ? "#13161b" : "#f3eede",
        }}>
          <span style={{ display:"flex", alignItems:"center", gap: 6, fontSize: 11 }}>
            <span style={{
              width: 24, height: 13, borderRadius: 7,
              background: hair, position:"relative",
              border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
            }}>
              <span style={{
                position:"absolute", left: 1, top: 1,
                width: 9, height: 9, borderRadius: 5,
                background: dark?"#a8a292":"#fff",
                border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
              }} />
            </span>
            <span>edit YAML</span>
          </span>
          <span className="wf-mono" style={{ fontSize: 9, color: sub }}>進階 · 直接改定義檔</span>
          <span style={{ flex: 1 }} />
          <span className="sk sk-thin" style={{
            padding:"5px 12px", fontSize: 11, background: dark?"#1d2025":"#fff",
          }}>← 返回看板</span>
          <span className="sk" style={{
            padding:"5px 14px", fontSize: 11, fontWeight: 600,
            background: dark ? "#2a2317" : "#fce9c4",
            borderColor: "#c98a2a",
          }}>↻ Re-run</span>
        </div>
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────
function Section({ title, sub, hair, children, defaultOpen=true }) {
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid " + hair }}>
      <div style={{ display:"flex", alignItems:"center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 9, opacity:.6 }}>{defaultOpen ? "▾" : "▸"}</span>
        <span className="wf-mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
        }}>{title}</span>
      </div>
      <div style={{ paddingLeft: 14 }}>{children}</div>
    </div>
  );
}

function Field({ label, sub, children, collapsible, defaultOpen=true, hair }) {
  const [open, setOpen] = React.useState(defaultOpen);
  const isOpen = collapsible ? open : true;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display:"flex", alignItems:"center", gap: 6, marginBottom: 6,
          fontSize: 11, fontWeight: 600, color: sub,
          cursor: collapsible ? "pointer" : "default",
        }}
        onClick={() => collapsible && setOpen(o => !o)}
      >
        {collapsible && <span style={{ fontSize: 9, opacity:.7 }}>{isOpen ? "▾" : "▸"}</span>}
        <span>{label}</span>
      </div>
      {isOpen && (
        <div style={{ display:"flex", flexDirection:"column", gap: 4 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function KV({ k, v, mono }) {
  return (
    <div style={{ display:"flex", gap: 10, fontSize: 11, padding:"2px 0" }}>
      <span className="wf-mono" style={{ width: 96, opacity:.6, fontSize: 10 }}>{k}</span>
      <span className={mono ? "wf-mono" : ""} style={{ fontSize: mono?10:11 }}>{v}</span>
    </div>
  );
}

function FileRow({ icon, name, meta }) {
  return (
    <div className="sk sk-thin" style={{
      padding:"6px 10px", fontSize: 11, display:"flex", alignItems:"center", gap: 8,
    }}>
      <span>{icon}</span>
      <span className="wf-mono" style={{ flex: 1, fontSize: 10 }}>{name}</span>
      <span className="wf-mono" style={{ fontSize: 9, opacity:.6 }}>{meta}</span>
      <span style={{ opacity:.5 }}>↗</span>
    </div>
  );
}

Object.assign(window, { DrawerStepDone, DrawerIterRunning, DrawerIterPaused, IterCardExpanded });

// ── Iteration card · expanded detail ──────────────────────────
function IterCardExpanded({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#f3eede";
  const cardBg = dark ? "#161a20" : "#fff";
  const blockBg = dark ? "#1a1d23" : "#f6efe0";

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 24, position:"relative", overflow:"hidden",
      display:"flex", justifyContent:"center", alignItems:"flex-start",
    }}>
      {/* card */}
      <div className="sk" style={{
        width: 640, background: cardBg, padding: 0,
        borderColor: "#b04040", borderWidth: 2,
        boxShadow: dark ? "0 16px 48px rgba(0,0,0,.45)" : "0 16px 48px rgba(28,25,22,.12)",
        position: "relative",
      }}>
        {/* left red band */}
        <span className="band band-red" style={{ width: 6, top: 0, bottom: 0, borderRadius: "3px 0 0 3px" }} />

        {/* HEADER */}
        <div style={{
          padding: "14px 18px 12px 22px",
          borderBottom: "1.5px solid " + hair,
          display:"flex", alignItems:"center", gap: 10,
        }}>
          <span style={{ fontSize: 16, fontWeight: 700 }}>Iter 3</span>
          <span className="wf-mono" style={{ fontSize: 10.5, color: sub }}>· 14:32 elapsed</span>
          <span className="chip" style={{
            fontSize: 10, padding:"2px 8px", fontWeight: 600,
            color:"#fff", background:"#b04040", borderColor:"transparent",
          }}>✕ fail</span>
          <span className="chip" style={{
            fontSize: 10, padding:"2px 8px",
            color:"#c98a2a", borderColor:"#c98a2a",
          }}>same as iter 2</span>
          <span style={{ flex: 1 }} />
          <span className="sk sk-thin" style={{
            padding:"3px 9px", fontSize: 10, background: dark?"#1d2025":"#fff",
            display:"inline-flex", alignItems:"center", gap: 4,
          }}>⇄ Diff vs prev</span>
          <span style={{ opacity:.5, cursor:"pointer", fontSize: 12 }}>▴ 摺</span>
        </div>

        {/* meta strip */}
        <div className="wf-mono" style={{
          padding: "7px 22px", fontSize: 10, color: sub,
          display:"flex", gap: 14, borderBottom: "1px solid " + hair,
          background: blockBg,
        }}>
          <span>started 38m ago</span>
          <span>· cost $0.62</span>
          <span>· ↑ 2.4k ↓ 1.6k tokens</span>
          <span style={{ marginLeft:"auto" }}>verdict ↳ <span className="pip pip-r" style={{ width:8, height:8, marginLeft: 4 }} /></span>
        </div>

        {/* SECTION 1: doer prompt */}
        <CardSection title="① Doer prompt" sub={sub} hair={hair}
          right={<span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7 }}>1,284 tok · base + iter 2 hint</span>}>
          <div className="wf-mono" style={{
            fontSize: 10.5, lineHeight: 1.55,
            background: codeBg, color: fg, padding: 10, borderRadius: 4,
            border: "1px solid " + hair, whiteSpace:"pre-wrap", maxHeight: 90, overflow:"hidden", position:"relative",
          }}>
{`你是負責 OAuth 收斂的 doer。修正 callback flow。

GOAL: { goal }

# iter 2 critic hint:
- buildRedirectUri 已通過,專注 callback handler
- timeout 從 fetch 層往上拋
…`}
            <div style={{
              position:"absolute", left:0, right:0, bottom: 0, height: 24,
              background: `linear-gradient(transparent, ${codeBg})`, pointerEvents:"none",
            }} />
          </div>
          <div style={{ marginTop: 4 }}>
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7, cursor:"pointer" }}>展開全文 ▾</span>
          </div>
        </CardSection>

        {/* SECTION 2: doer output */}
        <CardSection title="② Doer output" sub={sub} hair={hair}
          right={
            <span style={{ display:"inline-flex", alignItems:"center", gap: 6, fontSize: 10, color: sub }}>
              <span>raw</span>
              <span style={{
                width: 24, height: 13, borderRadius: 7,
                background: hair, position:"relative",
                border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
              }}>
                <span style={{
                  position:"absolute", left: 1, top: 1,
                  width: 9, height: 9, borderRadius: 5,
                  background: dark?"#a8a292":"#fff",
                }} />
              </span>
            </span>
          }>
          <div style={{
            padding: 10, background: blockBg, border: "1px solid " + hair,
            borderRadius: 4, fontSize: 11, lineHeight: 1.55,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>修改 callback handler timeout</div>
            <div>把 fetch 包進 try/catch,catch 後 throw OAuthTimeoutError;</div>
            <div>caller 收到後決定是否 retry。</div>
            <pre className="wf-mono" style={{
              margin: "6px 0 0", padding: 8, fontSize: 10,
              background: codeBg, border: "1px solid " + hair, borderRadius: 3,
              whiteSpace:"pre-wrap",
            }}>{`// src/oauth/callback.ts (patch)
try {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
} catch (e) {
  throw new OAuthTimeoutError(e);
}`}</pre>
          </div>
          <div className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65, marginTop: 4 }}>
            3 files changed · +52 −18
          </div>
        </CardSection>

        {/* SECTION 3: critic verdict + plan */}
        <CardSection title="③ Critic verdict + plan" sub={sub} hair={hair}
          right={<span className="chip" style={{
            fontSize: 9, padding:"1px 7px", color:"#fff", background:"#b04040", borderColor:"transparent",
          }}>REJECT</span>}>
          <div style={{
            padding: 10, background: dark?"#3a1f1c":"#f8d7d2", color: dark?"#f0c8c4":"#5a1c1c",
            border: "1px solid #b04040", borderRadius: 4, fontSize: 11, lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>不通過</div>
            <div>跟 iter 2 的 diff 幾乎相同(85% overlap),沒新增 test 覆蓋。</div>
            <div style={{ marginTop: 4 }}>AC #2 #3 仍紅。</div>
          </div>
          <div style={{
            marginTop: 8, padding: 10,
            background: codeBg, border: "1px solid " + hair, borderRadius: 4,
            fontSize: 11, lineHeight: 1.55,
          }}>
            <div className="wf-mono" style={{ fontSize: 9, color: sub, marginBottom: 4 }}>NEXT-ITER PLAN</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>不要再改 callback.ts — 改去看 client/auth-client.ts 的 retry 邏輯</li>
              <li>補 e2e:timeout / network drop / invalid state 三個 scenario</li>
              <li>跑 unit test 之前先清 cache</li>
            </ol>
          </div>
        </CardSection>

        {/* SECTION 4: intervention */}
        <CardSection title="④ Intervention" sub={sub} hair={hair} last
          right={<span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>已介入 1 次 · iter 2</span>}>
          <div style={{
            display:"grid", gridTemplateColumns:"repeat(5, 1fr)", gap: 5,
          }}>
            <MiniIxBtn icon="✎"  label="Edit"     dark={dark} hair={hair} accent="#c98a2a" />
            <MiniIxBtn icon="+"  label="Append"   dark={dark} hair={hair} />
            <MiniIxBtn icon="↺"  label="Redo Q&A" dark={dark} hair={hair} />
            <MiniIxBtn icon="✓"  label="Override" dark={dark} hair={hair} accent="#3a8a4a" />
            <MiniIxBtn icon="✕"  label="Abort"    dark={dark} hair={hair} accent="#b04040" />
          </div>
          <div className="wf-mono" style={{
            fontSize: 9, color: sub, opacity:.65, marginTop: 6,
          }}>
            這輪已結束 — 介入只會影響「下一輪」。要重啟整輪請點 ↻ Re-run iter 3。
          </div>
        </CardSection>
      </div>
    </div>
  );
}

function CardSection({ title, sub, hair, children, right, last }) {
  return (
    <div style={{
      padding: "12px 22px",
      borderBottom: last ? "none" : "1px solid " + hair,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 8 }}>
        <span className="wf-mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          textTransform:"uppercase", color: sub,
        }}>{title}</span>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
    </div>
  );
}

function MiniIxBtn({ icon, label, dark, hair, accent }) {
  return (
    <div className="sk sk-thin" style={{
      padding: "5px 4px", textAlign:"center", cursor:"pointer",
      background: dark ? "#1d2025" : "#fff",
      borderColor: accent || hair,
      display:"flex", flexDirection:"column", alignItems:"center", gap: 1,
    }}>
      <span style={{ fontSize: 13, color: accent || "currentColor", lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

// ── Drawer · Paused state (intervention panel) ────────────────
function DrawerIterPaused({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#f3eede";
  const amberBg = dark ? "#3a2d12" : "#fce9c4";
  const amberFg = dark ? "#e6c890" : "#5a4a1a";

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 0, position:"relative", overflow:"hidden",
    }}>
      {/* 背景 */}
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
              fontSize: 10, padding:"2px 8px", fontWeight: 600,
              color: amberFg, background: amberBg, borderColor:"#c98a2a",
              display:"inline-flex", alignItems:"center", gap: 5,
            }}>⏸ paused</span>
            <span className="chip" style={{
              fontSize: 10, padding:"2px 8px",
              background: dark?"#2a1f3a":"#e7dff2", borderColor:"transparent",
            }}>iter 6 · stalled</span>
          </div>

          {/* stall banner — muted amber inline */}
          <div style={{
            marginTop: 10, padding: "5px 10px",
            background: amberBg, color: amberFg,
            border: "1px solid #c98a2a", borderRadius: 4,
            fontSize: 10.5, display:"flex", alignItems:"center", gap: 8,
          }}>
            <span>⚠</span>
            <span><b>stall</b> · 連續 3 輪 progress = same / worse</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ fontSize: 9, opacity:.7 }}>auto-paused 14s ago</span>
          </div>
        </div>

        {/* BODY */}
        <div style={{ flex: 1, overflow:"hidden", padding: "0 18px" }}>
          {/* Definition collapsed */}
          <div style={{
            padding: "10px 0", borderBottom: "1px solid " + hair,
            display:"flex", alignItems:"center", gap: 8, cursor:"pointer",
          }}>
            <span style={{ fontSize: 9, opacity:.6 }}>▸</span>
            <span className="wf-mono" style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
            }}>Definition</span>
            <span style={{ fontSize: 11, color: sub, opacity:.7, flex: 1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              收斂 OAuth callback 流程 · AC ×4 · iter mode
            </span>
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>展開 ▾</span>
          </div>

          {/* Iteration history — last 3 expanded with prominent verdict dots */}
          <div style={{ padding: "12px 0 10px", borderBottom: "1px solid " + hair }}>
            <div style={{ display:"flex", alignItems:"center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, opacity:.6 }}>▾</span>
              <span className="wf-mono" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
              }}>Iteration history · last 3</span>
              <span style={{ flex: 1 }} />
              <span style={{ display:"flex", gap: 5, alignItems:"center" }}>
                <span className="wf-mono" style={{ fontSize: 9, color: sub }}>verdict</span>
                {[1,1,0,-1,-1,-1].map((d,i)=>(
                  <span key={i} className={"pip pip-" + (d===1?"g":d===-1?"r":"a") + (i>=3?" blink":"")}
                    style={{ width: 9, height: 9, outline: i>=3 ? "2px solid #c98a2a" : "none", outlineOffset: 1 }} />
                ))}
              </span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap: 6, paddingLeft: 14 }}>
              <IterExpandedRow n={4} verdict="reject" reason="critic: redirect_uri 校驗 regex 仍抓不到 trailing slash"
                doerSummary="patch buildRedirectUri() · 加 unit test · 改 docs/auth.md"
                hair={hair} sub={sub} codeBg={codeBg} fg={fg} />
              <IterExpandedRow n={5} verdict="reject" reason="critic: AC #2 仍紅 — error path timeout 沒 surface"
                doerSummary="加 try/catch · 補 timeout 邏輯 · 但 test 漏掉 retry case"
                hair={hair} sub={sub} codeBg={codeBg} fg={fg} />
              <IterExpandedRow n={6} verdict="reject" reason="critic: 跟上一輪幾乎相同 diff,沒有實質進展"
                doerSummary="(改了同一段 ↑) 微調 retry 條件 · 沒新增覆蓋"
                stalled hair={hair} sub={sub} codeBg={codeBg} fg={fg} />
            </div>
          </div>

          {/* Last critic plan — collapsible */}
          <CollapseBlock
            title="LAST CRITIC PLAN"
            sub={sub} hair={hair}
            initialOpen={false}
          >
            <div className="wf-mono" style={{
              fontSize: 10.5, lineHeight: 1.55,
              background: codeBg, color: fg, padding: 10, borderRadius: 4,
              border: "1px solid " + hair, whiteSpace:"pre-wrap",
            }}>
{`# critic verdict (iter 6) — REJECT
reason: 與 iter 5 重複,progress=same

next-iter plan (建議給 doer):
  1. 不要再改 buildRedirectUri,改去看 callback handler
  2. 把 timeout 從 fetch 層往上拋,讓 caller 決定 retry
  3. 補 test: callback timeout / network drop / invalid state
  4. 跑 e2e 之前先過 unit test`}
            </div>
          </CollapseBlock>

          {/* INTERVENTION GRID */}
          <div style={{ padding: "14px 0 10px" }}>
            <div className="wf-mono" style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              textTransform:"uppercase", color: sub, marginBottom: 8,
            }}>Intervention</div>
            <div style={{
              display:"grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              gap: 6,
            }}>
              <IxBtn icon="✎"  label="Edit prompt"   sub="改本輪 doer prompt" dark={dark} hair={hair} accent="#c98a2a" />
              <IxBtn icon="+"  label="Append prompt" sub="補一段 hint"        dark={dark} hair={hair} />
              <IxBtn icon="↺"  label="Redo Q&A"     sub="重新蒐集需求"      dark={dark} hair={hair} />
              <IxBtn icon="✓"  label="Override pass" sub="人工判定通過"      dark={dark} hair={hair} accent="#3a8a4a" />
              <IxBtn icon="✕"  label="Abort"         sub="中止 ticket"       dark={dark} hair={hair} accent="#b04040" />
            </div>
          </div>

          {/* Prompt edit box + restart */}
          <div style={{ paddingBottom: 16 }}>
            <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 6 }}>
              <span className="wf-mono" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1,
                textTransform:"uppercase", color: sub,
              }}>Prompt(本輪)</span>
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>1,284 tokens</span>
              <span style={{ flex: 1 }} />
              <span className="wf-mono" style={{ fontSize: 9, color: sub }}>diff vs base ▸</span>
            </div>
            <div className="wf-mono" style={{
              fontSize: 10.5, lineHeight: 1.55,
              background: codeBg, color: fg, padding: 10, borderRadius: 4,
              border: "1.5px solid #c98a2a",
              minHeight: 78, position:"relative",
              whiteSpace:"pre-wrap",
            }}>
{`你是負責 OAuth 收斂的 doer。
讀 src/oauth/* 後修正 callback flow。

GOAL:
{{ goal }}

# 介入提示(來自 user, iter 6 後追加):
- 別再動 buildRedirectUri
- 看 callback handler 的 timeout
- 補 e2e test:timeout / network drop / invalid state`}
              <span className="blink" style={{
                display:"inline-block", width: 7, height: 13,
                background: fg, verticalAlign:"text-bottom", marginLeft: 1,
              }} />
            </div>
            <div style={{
              display:"flex", alignItems:"center", gap: 8,
              marginTop: 8,
            }}>
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7 }}>
                ⌘ + Enter 重啟 · Esc 取消
              </span>
              <span style={{ flex: 1 }} />
              <span className="sk sk-thin" style={{
                padding:"4px 10px", fontSize: 11, background: dark?"#1d2025":"#fff",
              }}>取消</span>
              <span className="sk" style={{
                padding:"4px 14px", fontSize: 11, fontWeight: 600,
                background: amberBg, color: amberFg, borderColor:"#c98a2a",
                display:"inline-flex", alignItems:"center", gap: 5,
              }}>↻ 重啟 iter 7</span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          borderTop: "1.5px solid " + hair,
          padding: "10px 18px",
          display:"flex", alignItems:"center", gap: 10,
          background: dark ? "#13161b" : "#f3eede",
        }}>
          <span className="wf-mono" style={{ fontSize: 10, color: sub }}>
            ⓘ Paused · 等使用者介入後手動重啟
          </span>
          <span style={{ flex: 1 }} />
          <span className="sk sk-thin" style={{
            padding:"5px 12px", fontSize: 11, background: dark?"#1d2025":"#fff",
          }}>← 返回看板</span>
        </div>
      </div>
    </div>
  );
}

function IterExpandedRow({ n, verdict, reason, doerSummary, stalled, hair, sub, codeBg, fg }) {
  const colors = {
    pass:    { bg:"#3a8a4a", glyph:"✓" },
    reject:  { bg:"#b04040", glyph:"✕" },
    partial: { bg:"#c98a2a", glyph:"~" },
  };
  const c = colors[verdict];
  return (
    <div className="sk sk-thin" style={{
      padding: "6px 10px", fontSize: 10.5,
      borderColor: stalled ? "#c98a2a" : hair,
      borderWidth: stalled ? 1.5 : 1,
      background: stalled ? (codeBg) : "transparent",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 4 }}>
        <span className="wf-mono" style={{ width: 36, opacity:.7 }}>iter {n}</span>
        <span style={{
          width: 14, height: 14, borderRadius: 3, fontSize: 9, fontWeight: 700,
          background: c.bg, color: "#fff",
          display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink: 0,
        }}>{c.glyph}</span>
        <span style={{ flex: 1, fontWeight: 600 }}>{reason}</span>
        {stalled && <span className="chip" style={{
          fontSize: 8.5, padding:"1px 5px",
          color:"#c98a2a", borderColor:"#c98a2a",
        }}>same as ↑</span>}
      </div>
      <div style={{ paddingLeft: 44, fontSize: 10, color: sub, lineHeight: 1.4 }}>
        <span style={{ opacity:.6 }}>doer: </span>{doerSummary}
      </div>
    </div>
  );
}

function CollapseBlock({ title, sub, hair, children, initialOpen=false }) {
  const [open, setOpen] = React.useState(initialOpen);
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid " + hair }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display:"flex", alignItems:"center", gap: 6, cursor:"pointer",
          marginBottom: open ? 8 : 0,
        }}
      >
        <span style={{ fontSize: 9, opacity:.6 }}>{open ? "▾" : "▸"}</span>
        <span className="wf-mono" style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
        }}>{title}</span>
      </div>
      {open && <div style={{ paddingLeft: 14 }}>{children}</div>}
    </div>
  );
}

function IxBtn({ icon, label, sub, dark, hair, accent }) {
  return (
    <div className="sk sk-thin" style={{
      padding: "8px 6px", textAlign:"center", cursor:"pointer",
      background: dark ? "#1d2025" : "#fff",
      borderColor: accent || hair,
      display:"flex", flexDirection:"column", alignItems:"center", gap: 3,
    }}>
      <span style={{ fontSize: 16, color: accent || "currentColor", lineHeight: 1 }}>{icon}</span>
      <span style={{ fontSize: 10.5, fontWeight: 600 }}>{label}</span>
      <span className="wf-mono" style={{ fontSize: 8.5, opacity:.55, lineHeight: 1.2 }}>{sub}</span>
    </div>
  );
}

// ── Drawer · Running state (iterative ticket 跑中) ─────────────
function DrawerIterRunning({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const codeBg = dark ? "#0e1116" : "#f3eede";
  const liveBg = dark ? "#13161b" : "#f8f4e8";

  // streamed markdown placeholder lines
  const streamLines = [
    { kind:"h", text:"分析:OAuth callback 失敗的根因" },
    { kind:"p", text:"從上一輪 critic 的 verdict 看,problem 是 redirect_uri" },
    { kind:"p", text:"在 dev 環境下會被 normalize 成 trailing-slash 的形式," },
    { kind:"p", text:"但 google console 註冊的是 no-slash 版本。" },
    { kind:"h", text:"修正策略" },
    { kind:"li", text:"在 oauth 模組的 build_redirect_uri() 裡 strip trailing slash" },
    { kind:"li", text:"加 unit test 覆蓋兩種寫法" },
    { kind:"li", text:"更新 docs/auth.md 註明這個 gotcha" },
    { kind:"code", text:"// patch: src/oauth/redirect.ts\nexport function buildRedirectUri(base: string) {\n  return base.replace(/\\/+$/, \"\");\n}" },
    { kind:"p", text:"接著我會跑 critic,確認 AC 第 2、3 條是否通過" },
    { kind:"cursor" },
  ];

  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{
      padding: 0, position:"relative", overflow:"hidden",
    }}>
      {/* 背景 */}
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
              fontSize: 10, padding:"2px 8px", fontWeight: 600,
              color:"#fff", background:"#4a4fb0", borderColor:"transparent",
              display:"inline-flex", alignItems:"center", gap: 5,
            }}>
              <span className="pulse" style={{ width:6, height:6, borderRadius:3, background:"#fff" }} />
              running
            </span>
            <span className="chip" style={{
              fontSize: 10, padding:"2px 8px",
              background: dark?"#2a1f3a":"#e7dff2", borderColor:"transparent",
            }}>iter 4 / ∞</span>
          </div>
          <div className="wf-mono" style={{ fontSize: 10, color: sub, marginTop: 6, display:"flex", gap: 12 }}>
            <span>started 18m ago</span>
            <span>· 3 prev iters · 02:14 / 04:18 elapsed</span>
            <span>· $1.84 spent</span>
          </div>
        </div>

        {/* BODY (auto-scroll 到底) */}
        <div style={{ flex: 1, overflow:"hidden", padding: "0 18px", display:"flex", flexDirection:"column" }}>
          {/* Definition (collapsed — 一行) */}
          <div style={{
            padding: "10px 0", borderBottom: "1px solid " + hair,
            display:"flex", alignItems:"center", gap: 8, cursor:"pointer",
          }}>
            <span style={{ fontSize: 9, opacity:.6 }}>▸</span>
            <span className="wf-mono" style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
            }}>Definition</span>
            <span style={{ fontSize: 11, color: sub, opacity:.7, flex: 1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              收斂 OAuth callback 流程 · AC ×4 · iter mode
            </span>
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>展開 ▾</span>
          </div>

          {/* Iteration history (折疊 stack) */}
          <div style={{ padding: "12px 0 10px" }}>
            <div style={{ display:"flex", alignItems:"center", gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 9, opacity:.6 }}>▾</span>
              <span className="wf-mono" style={{
                fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase", color: sub,
              }}>Iteration history</span>
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.55, marginLeft:"auto" }}>3 prev · 全部展開</span>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap: 4, paddingLeft: 14 }}>
              <IterHistoryRow n={1} verdict="reject" reason="AC #2 未通過 — redirect_uri 缺少校驗"     dur="03:42" hair={hair} sub={sub} />
              <IterHistoryRow n={2} verdict="reject" reason="critic 認為 error path 沒處理 timeout"   dur="04:11" hair={hair} sub={sub} />
              <IterHistoryRow n={3} verdict="partial" reason="AC #1, #4 通過 / #2, #3 仍紅"           dur="02:55" hair={hair} sub={sub} />
            </div>
          </div>

          {/* LIVE RUNNER (主視區) */}
          <div style={{
            flex: 1, marginTop: 4, marginBottom: 14,
            border: "1.5px solid #4a4fb0", borderRadius: 6,
            background: liveBg, display:"flex", flexDirection:"column",
            overflow:"hidden",
          }}>
            {/* runner header */}
            <div style={{
              padding:"8px 12px",
              borderBottom: "1px solid " + hair,
              display:"flex", alignItems:"center", gap: 10, fontSize: 11,
              background: dark ? "#1a1d23" : "#fbf8f1",
            }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap: 5, fontWeight: 700 }}>
                <span className="pulse" style={{ width:8, height:8, borderRadius:4, background:"#4a4fb0" }} />
                Iter 4
              </span>
              <span style={{ display:"inline-flex", alignItems:"center", gap: 4, padding:"1px 7px", borderRadius: 3,
                background: dark?"#2a1f3a":"#e7dff2", border: "1px solid " + (dark?"#3a3a40":"#1c1916"), fontSize: 10 }}>
                doer
              </span>
              <span style={{ opacity:.4 }}>▶</span>
              <span style={{ padding:"1px 7px", borderRadius: 3, fontSize: 10,
                border: "1px solid " + (dark?"#3a3a40":"rgba(0,0,0,.25)"), opacity:.5 }}>critic</span>
              <span style={{ opacity:.4 }}>▶</span>
              <span style={{ padding:"1px 7px", borderRadius: 3, fontSize: 10,
                border: "1px solid " + (dark?"#3a3a40":"rgba(0,0,0,.25)"), opacity:.4 }}>✓</span>

              <span style={{ flex: 1 }} />

              <span className="wf-mono" style={{ fontSize: 10, color: sub }}>02:14</span>
              <span className="wf-mono" style={{ fontSize: 10, color:"#3a8a4a" }}>↑ 1.2k</span>
              <span className="wf-mono" style={{ fontSize: 10, color:"#3a6fb0" }}>↓ 892</span>

              <span className="sk sk-thin" style={{ padding:"2px 7px", fontSize: 10, background: dark?"#1d2025":"#fff" }}>⏸ pause</span>
              <span className="sk sk-thin" style={{ padding:"2px 7px", fontSize: 10, color:"#b04040", borderColor:"#b04040", background: dark?"#3a1f1c":"#fff" }}>✕ abort</span>
            </div>

            {/* stream body */}
            <div style={{
              flex: 1, overflow:"hidden", position:"relative",
              padding: "10px 14px", fontSize: 11.5, lineHeight: 1.55,
              fontFamily: "Noto Sans TC, system-ui, sans-serif",
            }}>
              {/* fade-out top edge */}
              <div style={{
                position:"absolute", left:0, right:0, top:0, height: 18,
                background: `linear-gradient(${liveBg}, transparent)`, pointerEvents:"none", zIndex: 2,
              }} />
              <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
                {streamLines.map((l,i) => {
                  if (l.kind === "h") return <div key={i} style={{ fontWeight: 700, fontSize: 12.5, marginTop: 4 }}>{l.text}</div>;
                  if (l.kind === "p") return <div key={i}>{l.text}</div>;
                  if (l.kind === "li") return <div key={i} style={{ paddingLeft: 14, position:"relative" }}>
                    <span style={{ position:"absolute", left: 2 }}>•</span>{l.text}
                  </div>;
                  if (l.kind === "code") return (
                    <pre key={i} className="wf-mono" style={{
                      margin: "4px 0", padding: 10, fontSize: 10.5, lineHeight: 1.5,
                      background: codeBg, color: fg, borderRadius: 4,
                      border: "1px solid " + hair, whiteSpace:"pre-wrap",
                    }}>{l.text}</pre>
                  );
                  if (l.kind === "cursor") return (
                    <span key={i} className="blink" style={{
                      display:"inline-block", width: 7, height: 14,
                      background: fg, verticalAlign:"text-bottom",
                    }} />
                  );
                  return null;
                })}
              </div>
            </div>

            {/* sticky-bottom indicator + raw toggle */}
            <div style={{
              padding: "6px 12px",
              borderTop: "1px solid " + hair,
              display:"flex", alignItems:"center", gap: 10, fontSize: 10,
              background: dark ? "#1a1d23" : "#fbf8f1",
              color: sub,
            }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap: 5 }}>
                <span className="pulse" style={{ width:6, height:6, borderRadius:3, background:"#3a8a4a" }} />
                <span>auto-scroll · 黏底</span>
              </span>
              <span style={{ opacity:.4 }}>·</span>
              <span className="wf-mono">streaming markdown</span>
              <span style={{ flex: 1 }} />
              <span style={{ display:"inline-flex", alignItems:"center", gap: 6 }}>
                <span style={{
                  width: 24, height: 13, borderRadius: 7,
                  background: hair, position:"relative",
                  border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
                }}>
                  <span style={{
                    position:"absolute", left: 1, top: 1,
                    width: 9, height: 9, borderRadius: 5,
                    background: dark?"#a8a292":"#fff",
                    border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
                  }} />
                </span>
                <span>View raw</span>
              </span>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          borderTop: "1.5px solid " + hair,
          padding: "10px 18px",
          display:"flex", alignItems:"center", gap: 10,
          background: dark ? "#13161b" : "#f3eede",
        }}>
          <span className="wf-mono" style={{ fontSize: 10, color: sub }}>
            ⓘ State-aware drawer · 自動 scroll 到 live runner
          </span>
          <span style={{ flex: 1 }} />
          <span className="sk sk-thin" style={{
            padding:"5px 12px", fontSize: 11, background: dark?"#1d2025":"#fff",
          }}>← 返回看板</span>
          <span className="sk sk-thin" style={{
            padding:"5px 12px", fontSize: 11, background: dark?"#1d2025":"#fff",
            color:"#c98a2a", borderColor:"#c98a2a",
          }}>⏸ pause iter</span>
        </div>
      </div>
    </div>
  );
}

function IterHistoryRow({ n, verdict, reason, dur, hair, sub }) {
  const colors = {
    pass:    { bg:"#3a8a4a", fg:"#fff",  glyph:"✓" },
    reject:  { bg:"#b04040", fg:"#fff",  glyph:"✕" },
    partial: { bg:"#c98a2a", fg:"#fff",  glyph:"~" },
  };
  const c = colors[verdict];
  return (
    <div className="sk sk-thin" style={{
      padding:"6px 10px", fontSize: 10.5,
      display:"flex", alignItems:"center", gap: 8,
      borderColor: hair,
    }}>
      <span className="wf-mono" style={{ width: 36, opacity:.6, fontSize: 10 }}>iter {n}</span>
      <span style={{
        width: 14, height: 14, borderRadius: 3, fontSize: 9, fontWeight: 700,
        background: c.bg, color: c.fg,
        display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink: 0,
      }}>{c.glyph}</span>
      <span style={{ flex: 1, color: sub, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{reason}</span>
      <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>{dur}</span>
      <span style={{ opacity:.4, fontSize: 10 }}>▸</span>
    </div>
  );
}

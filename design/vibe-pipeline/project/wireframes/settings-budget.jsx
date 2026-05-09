// Settings modal · Budget tab
// 上半: pricing table (CLI / model / input / output per 1M)
// 中段: 三層 caps — daily / pipeline / ticket,soft + hard + 「無限制」toggle
// 下方: 當日 status preview (used / soft / hard)

function SettingsBudget({ dark }) {
  const fg = dark ? "#e7e3d8" : "#1c1916";
  const sub = dark ? "#a8a292" : "#6e6658";
  const hair = dark ? "#3a3a40" : "#dcd6c8";
  const modalBg = dark ? "#161a20" : "#fbf8f1";
  const sideBg = dark ? "#13161b" : "#f3eede";
  const cardBg = dark ? "#1a1d23" : "#fff";
  const codeBg = dark ? "#0e1116" : "#f3eede";

  const tabs = [
    { id:"general",  label:"General",   icon:"⚙" },
    { id:"models",   label:"Models",    icon:"◌" },
    { id:"budget",   label:"Budget",    icon:"$",  active: true },
    { id:"skills",   label:"Skills",    icon:"✦",  count: 12, badge: 2 },
    { id:"hooks",    label:"Hooks",     icon:"⎌" },
    { id:"keys",     label:"API keys",  icon:"⚿" },
    { id:"members",  label:"Members",   icon:"⌾" },
  ];

  // Pricing rows (USD per 1M tokens)
  const pricing = [
    { cli:"claude",   model:"sonnet-4.5",     input:"3.00",  output:"15.00" },
    { cli:"claude",   model:"haiku-4.5",      input:"1.00",  output:"5.00"  },
    { cli:"claude",   model:"opus-4.1",       input:"15.00", output:"75.00" },
    { cli:"codex",    model:"gpt-5-pro",      input:"5.00",  output:"15.00" },
    { cli:"codex",    model:"gpt-5-mini",     input:"0.25",  output:"2.00"  },
    { cli:"gemini",   model:"2.5-pro",        input:"1.25",  output:"10.00" },
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
        position:"relative", width: 980, height: 740,
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
            <span style={{ fontSize: 16, fontWeight: 700 }}>Budget</span>
            <span className="wf-mono" style={{ fontSize: 10, color: sub }}>· 預算 caps + 模型計價</span>
            <span style={{ flex: 1 }} />
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65 }}>
              幣別 USD · 估算僅供參考、實際以 provider bill 為準
            </span>
            <span style={{ opacity:.5, cursor:"pointer", fontSize: 16, marginLeft: 12 }}>×</span>
          </div>

          {/* SCROLL CONTENT */}
          <div style={{ flex: 1, overflow:"auto", padding: "16px 22px" }}>

            {/* ─────────── TOP HALF — pricing table ─────────── */}
            <SectionHeader sub={sub}>
              Pricing · CLI / model 估算單價
              <span style={{ flex: 1 }} />
              <span className="sk sk-thin" style={{
                padding:"3px 8px", fontSize: 10, background: cardBg,
                display:"inline-flex", alignItems:"center", gap: 4,
              }}>+ 新增列</span>
              <span className="sk sk-thin" style={{
                padding:"3px 8px", fontSize: 10, background: cardBg,
              }}>↺ 重置為預設</span>
            </SectionHeader>

            <div className="sk sk-thin" style={{
              background: cardBg, borderColor: hair, padding: 0, marginBottom: 18,
              overflow:"hidden",
            }}>
              {/* header row */}
              <div style={{
                display:"grid",
                gridTemplateColumns:"110px 1fr 130px 130px 28px",
                padding: "8px 12px", gap: 8,
                background: dark?"#161a20":"#fbf8f1",
                borderBottom: "1px solid " + hair,
                fontSize: 10, fontWeight: 700, letterSpacing: .4,
                color: sub, textTransform:"uppercase",
              }}>
                <span>CLI</span>
                <span>Model</span>
                <span style={{ textAlign:"right" }}>Input · /1M</span>
                <span style={{ textAlign:"right" }}>Output · /1M</span>
                <span></span>
              </div>

              {pricing.map((row, i) => (
                <PricingRow key={i} row={row} dark={dark} hair={hair} sub={sub} cardBg={cardBg} codeBg={codeBg} last={i===pricing.length-1} />
              ))}
            </div>

            {/* ─────────── MIDDLE — three-tier caps ─────────── */}
            <SectionHeader sub={sub}>
              Caps · 三層預算上限
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65, fontWeight: 400, textTransform:"none", letterSpacing: 0 }}>
                觸 soft → 通知;觸 hard → pipeline 強制 pause
              </span>
            </SectionHeader>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
              <CapCard
                tier="Daily"
                scope="整個專案 · 每日 00:00 重置"
                soft="20.00" hard="50.00" unlimited={false}
                used="$8.42" pctSoft={42} pctHard={17}
                accent="#3a6fb0"
                dark={dark} sub={sub} hair={hair} cardBg={cardBg} codeBg={codeBg}
              />
              <CapCard
                tier="Pipeline"
                scope="每條 pipeline 累計"
                soft="5.00" hard="12.00" unlimited={false}
                used="$2.18" pctSoft={44} pctHard={18}
                accent="#c98a2a"
                dark={dark} sub={sub} hair={hair} cardBg={cardBg} codeBg={codeBg}
              />
              <CapCard
                tier="Ticket"
                scope="每張 ticket(含 critic)"
                soft="—" hard="—" unlimited={true}
                used="$0.34" pctSoft={null} pctHard={null}
                accent="#6a6258"
                dark={dark} sub={sub} hair={hair} cardBg={cardBg} codeBg={codeBg}
              />
            </div>

            {/* ─────────── BOTTOM — today status preview ─────────── */}
            <SectionHeader sub={sub}>
              Status · 今日 (2026-05-08)
              <span style={{ flex: 1 }} />
              <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65, fontWeight: 400, textTransform:"none", letterSpacing: 0 }}>
                最後更新 12s ago
              </span>
            </SectionHeader>

            <div className="sk sk-thin" style={{
              background: cardBg, borderColor: hair, padding: "14px 16px",
              display:"flex", flexDirection:"column", gap: 12,
            }}>
              {/* big numbers row */}
              <div style={{ display:"flex", alignItems:"flex-end", gap: 18 }}>
                <Stat label="今日已用" big="$8.42" sub="across 3 pipelines" tone={fg} subTone={sub} mono />
                <span style={{ fontSize: 18, color: sub, opacity:.4, paddingBottom: 6 }}>/</span>
                <Stat label="Soft cap" big="$20.00" sub="42% 使用" tone="#c98a2a" subTone={sub} mono />
                <span style={{ fontSize: 18, color: sub, opacity:.4, paddingBottom: 6 }}>/</span>
                <Stat label="Hard cap" big="$50.00" sub="17% 使用" tone="#b04040" subTone={sub} mono />

                <span style={{ flex: 1 }} />

                <div style={{ textAlign:"right", display:"flex", flexDirection:"column", gap: 4 }}>
                  <span className="wf-mono" style={{ fontSize: 9, color: sub, letterSpacing: .4, textTransform:"uppercase" }}>
                    預估觸 soft
                  </span>
                  <span className="wf-mono" style={{ fontSize: 13, fontWeight: 700, color: fg }}>
                    ~ 17:40 (依目前燃燒率)
                  </span>
                </div>
              </div>

              {/* gauge — daily */}
              <Gauge
                used={8.42} soft={20} hard={50}
                dark={dark} hair={hair} sub={sub}
              />

              {/* breakdown */}
              <div style={{
                display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap: 10,
                paddingTop: 10, borderTop: "1px dashed " + hair,
              }}>
                <BreakdownRow icon="◐" label="feat-search · ranking 優化" cli="claude" model="sonnet-4.5" cost="$4.16" pct={49} accent="#3a6fb0" dark={dark} sub={sub} hair={hair} />
                <BreakdownRow icon="◐" label="refactor-api · error mapping" cli="codex"  model="gpt-5-pro"  cost="$3.02" pct={36} accent="#3a8a4a" dark={dark} sub={sub} hair={hair} />
                <BreakdownRow icon="◑" label="bugfix-oauth · iter 6"        cli="claude" model="haiku-4.5"  cost="$1.24" pct={15} accent="#c98a2a" dark={dark} sub={sub} hair={hair} />
              </div>
            </div>

            {/* footer note */}
            <div className="note" style={{ marginTop: 10, fontSize: 11, opacity: .8 }}>
              注:估算用 prompt + completion token 數 × pricing table 單價;cache hit 折抵尚未支援。
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── helpers ─── */

function SectionHeader({ sub, children }) {
  return (
    <div className="wf-mono" style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform:"uppercase",
      color: sub, marginBottom: 8,
      display:"flex", alignItems:"center", gap: 8,
    }}>
      {children}
    </div>
  );
}

function PricingRow({ row, dark, hair, sub, cardBg, codeBg, last }) {
  const cliColors = {
    claude: "#c98a2a",
    codex:  "#3a8a4a",
    gemini: "#3a6fb0",
  };
  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:"110px 1fr 130px 130px 28px",
      padding: "7px 12px", gap: 8, alignItems:"center",
      borderBottom: last ? "none" : "1px solid " + hair,
      fontSize: 11,
    }}>
      {/* CLI chip */}
      <span className="wf-mono" style={{
        display:"inline-flex", alignItems:"center", gap: 5,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: 3, background: cliColors[row.cli] || "#888" }} />
        {row.cli}
      </span>

      {/* model — looks editable */}
      <span className="wf-mono sk sk-thin" style={{
        padding:"2px 8px", fontSize: 11,
        background: dark?"#0e1116":"#fbf8f1",
        borderRadius: 3, borderStyle:"solid",
        display:"inline-flex", alignItems:"center", gap: 6,
        width:"fit-content",
      }}>
        {row.model}
        <span style={{ opacity:.4, fontSize: 9 }}>✎</span>
      </span>

      {/* input price */}
      <PriceCell value={row.input} sub={sub} dark={dark} />
      {/* output price */}
      <PriceCell value={row.output} sub={sub} dark={dark} />

      {/* delete */}
      <span style={{
        opacity:.45, textAlign:"center", cursor:"pointer", fontSize: 12,
      }}>×</span>
    </div>
  );
}

function PriceCell({ value, sub, dark }) {
  return (
    <span className="sk sk-thin wf-mono" style={{
      padding:"2px 8px", fontSize: 11,
      background: dark?"#0e1116":"#fbf8f1",
      borderRadius: 3, borderStyle:"solid",
      display:"inline-flex", alignItems:"center", justifyContent:"flex-end", gap: 4,
      justifySelf:"end", minWidth: 90,
    }}>
      <span style={{ color: sub, opacity:.65, fontSize: 10 }}>$</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </span>
  );
}

function CapCard({ tier, scope, soft, hard, unlimited, used, pctSoft, pctHard, accent, dark, sub, hair, cardBg, codeBg }) {
  return (
    <div className="sk sk-thin" style={{
      background: cardBg, borderColor: hair, padding: 0, position:"relative",
      display:"flex", flexDirection:"column", overflow:"hidden",
    }}>
      <div className="band" style={{ background: accent }} />

      {/* header */}
      <div style={{
        padding:"10px 14px 8px 18px",
        borderBottom: "1px solid " + hair,
        background: dark?"#161a20":"#fbf8f1",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{tier}</span>
          {unlimited && <span className="chip" style={{
            fontSize: 9, padding:"1px 6px",
            color: sub, borderColor: hair, background:"transparent",
          }}>無限制</span>}
        </div>
        <div className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7, marginTop: 2 }}>{scope}</div>
      </div>

      {/* fields */}
      <div style={{ padding: "12px 14px 12px 18px", display:"flex", flexDirection:"column", gap: 10 }}>
        <CapField label="Soft cap"  hint="觸發通知" value={soft} unit="USD" disabled={unlimited} dark={dark} sub={sub} hair={hair} />
        <CapField label="Hard cap"  hint="強制 pause" value={hard} unit="USD" disabled={unlimited} dark={dark} sub={sub} hair={hair} />

        {/* unlimited toggle */}
        <div style={{
          display:"flex", alignItems:"center", gap: 8,
          paddingTop: 6, borderTop: "1px dashed " + hair,
        }}>
          <Toggle on={unlimited} dark={dark} />
          <span style={{ fontSize: 11 }}>無限制</span>
          <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>
            {unlimited ? "不會 pause" : "off"}
          </span>
        </div>
      </div>

      {/* mini gauge */}
      {!unlimited && (
        <div style={{
          padding: "10px 14px 10px 18px", borderTop: "1px solid " + hair,
          background: dark?"#13161b":"#f3eede",
        }}>
          <div style={{ display:"flex", alignItems:"baseline", gap: 6, marginBottom: 6 }}>
            <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700 }}>{used}</span>
            <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65 }}>
              · soft {pctSoft}% · hard {pctHard}%
            </span>
          </div>
          <MiniBar pct={pctSoft} accent={accent} dark={dark} hair={hair} />
        </div>
      )}
      {unlimited && (
        <div style={{
          padding: "10px 14px 10px 18px", borderTop: "1px solid " + hair,
          background: dark?"#13161b":"#f3eede",
          display:"flex", alignItems:"center", gap: 6,
        }}>
          <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700 }}>{used}</span>
          <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.65 }}>· 今日(僅監控、不限制)</span>
        </div>
      )}
    </div>
  );
}

function CapField({ label, hint, value, unit, disabled, dark, sub, hair }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 8, opacity: disabled ? .35 : 1 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 600 }}>{label}</div>
        <div className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7 }}>{hint}</div>
      </div>
      <span className="sk sk-thin wf-mono" style={{
        padding:"3px 8px", fontSize: 11,
        background: dark?"#0e1116":"#fff",
        borderRadius: 3, borderStyle: disabled ? "dashed" : "solid",
        display:"inline-flex", alignItems:"center", gap: 5,
        minWidth: 92, justifyContent:"flex-end",
      }}>
        <span style={{ color: sub, opacity:.65, fontSize: 10 }}>$</span>
        <span style={{ fontWeight: 600 }}>{value}</span>
        <span style={{ color: sub, opacity:.45, fontSize: 9, marginLeft: 4 }}>{unit}</span>
      </span>
    </div>
  );
}

function Toggle({ on, dark }) {
  return (
    <span style={{
      width: 26, height: 14, borderRadius: 7, position:"relative",
      background: on ? "#3a8a4a" : (dark?"#2a2e36":"#d8d2c0"),
      border: "1px solid " + (dark?"#3a3a40":"#1c1916"),
      flex:"0 0 auto",
    }}>
      <span style={{
        position:"absolute", top: 1, left: on ? 13 : 1,
        width: 10, height: 10, borderRadius: 5,
        background:"#fff", transition:"left .15s",
      }} />
    </span>
  );
}

function MiniBar({ pct, accent, dark, hair }) {
  return (
    <div style={{
      height: 6, background: dark?"#0e1116":"#e8e1cf",
      border: "1px solid " + hair, borderRadius: 3, overflow:"hidden",
      position:"relative",
    }}>
      <div style={{
        position:"absolute", left: 0, top: 0, bottom: 0,
        width: pct + "%", background: accent,
      }} />
      {/* hard cap mark — at 100% of soft = some fraction of hard */}
    </div>
  );
}

function Stat({ label, big, sub: subText, tone, subTone, mono }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap: 2 }}>
      <span className="wf-mono" style={{ fontSize: 9, color: subTone, letterSpacing: .4, textTransform:"uppercase" }}>{label}</span>
      <span className={mono?"wf-mono":""} style={{ fontSize: 22, fontWeight: 700, color: tone, lineHeight: 1 }}>{big}</span>
      <span className="wf-mono" style={{ fontSize: 9, color: subTone, opacity:.7 }}>{subText}</span>
    </div>
  );
}

function Gauge({ used, soft, hard, dark, hair, sub }) {
  const usedPct = (used / hard) * 100;
  const softPct = (soft / hard) * 100;
  return (
    <div>
      <div style={{
        height: 14, background: dark?"#0e1116":"#e8e1cf",
        border: "1px solid " + hair, borderRadius: 4,
        position:"relative", overflow:"hidden",
      }}>
        {/* soft zone shading up to softPct */}
        <div style={{
          position:"absolute", left: 0, top: 0, bottom: 0, width: softPct + "%",
          background: dark ? "rgba(201,138,42,.10)" : "rgba(201,138,42,.14)",
        }} />
        {/* used bar */}
        <div style={{
          position:"absolute", left: 0, top: 0, bottom: 0, width: usedPct + "%",
          background: "#3a8a4a",
        }} />
        {/* soft cap tick */}
        <div style={{
          position:"absolute", left: softPct + "%", top: -2, bottom: -2,
          width: 2, background: "#c98a2a",
        }} />
        {/* hard cap tick (right edge) */}
        <div style={{
          position:"absolute", right: 0, top: -2, bottom: -2,
          width: 2, background: "#b04040",
        }} />
      </div>
      {/* labels under */}
      <div className="wf-mono" style={{
        position:"relative", height: 16, fontSize: 9, color: sub, marginTop: 4,
      }}>
        <span style={{ position:"absolute", left: usedPct + "%", transform:"translateX(-50%)", color:"#3a8a4a", fontWeight: 700 }}>
          ▲ ${used.toFixed(2)}
        </span>
        <span style={{ position:"absolute", left: softPct + "%", transform:"translateX(-50%)", color:"#c98a2a" }}>
          soft ${soft.toFixed(0)}
        </span>
        <span style={{ position:"absolute", right: 0, color:"#b04040" }}>
          hard ${hard.toFixed(0)}
        </span>
      </div>
    </div>
  );
}

function BreakdownRow({ icon, label, cli, model, cost, pct, accent, dark, sub, hair }) {
  return (
    <div style={{
      display:"flex", flexDirection:"column", gap: 4,
      padding: "6px 0",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <span style={{ color: accent, fontSize: 12 }}>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex: 1 }}>{label}</span>
        <span className="wf-mono" style={{ fontSize: 11, fontWeight: 700 }}>{cost}</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.7 }}>
          {cli} · {model}
        </span>
        <span style={{ flex: 1 }} />
        <span className="wf-mono" style={{ fontSize: 9, color: sub, opacity:.6 }}>{pct}%</span>
      </div>
      <MiniBar pct={pct} accent={accent} dark={dark} hair={hair} />
    </div>
  );
}

Object.assign(window, { SettingsBudget });

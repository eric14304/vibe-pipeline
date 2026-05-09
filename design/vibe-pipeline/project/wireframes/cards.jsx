// Ticket card variations — step vs iterative, focus on stall visualization
// 4 variations × 2 states (step + iter) shown for each

// ────── Variant A: 文件描述的「標準」設計 ──────
// Step card: 標題 + 左色帶 + mode badge + stall icon
// Iter card: 加 history dots strip + stage diagram + iter 計數
function CardsStandard({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 16, overflow:"hidden" }}>
      <CardSectionLabel dark={dark}>A · 標準 (per spec)</CardSectionLabel>
      <CardRowLabel dark={dark}>STEP CARD</CardRowLabel>
      <CardA_Step dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · running</CardRowLabel>
      <CardA_Iter dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · paused / stalled</CardRowLabel>
      <CardA_Iter dark={dark} paused />
    </div>
  );
}

// ────── Variant B: 緊湊版,iter & step 視覺密度差異更小 ──────
// 用迷你 sparkline 取代 dots strip;stage diagram 收成 3-pip 流程燈
function CardsCompact({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 16, overflow:"hidden" }}>
      <CardSectionLabel dark={dark}>B · Compact (sparkline)</CardSectionLabel>
      <CardRowLabel dark={dark}>STEP CARD</CardRowLabel>
      <CardB_Step dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · running</CardRowLabel>
      <CardB_Iter dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · paused</CardRowLabel>
      <CardB_Iter dark={dark} paused />
    </div>
  );
}

// ────── Variant C: 視覺隱喻 — iter card = 「進度圈 + verdict 環」 ──────
// 走 metaphorical 路線:左側放一個圓環,環上 6 段顯示 last-6 verdict
// stage 用環內中心字呈現
function CardsRing({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 16, overflow:"hidden" }}>
      <CardSectionLabel dark={dark}>C · Ring (隱喻)</CardSectionLabel>
      <CardRowLabel dark={dark}>STEP CARD</CardRowLabel>
      <CardC_Step dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · running</CardRowLabel>
      <CardC_Iter dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · paused</CardRowLabel>
      <CardC_Iter dark={dark} paused />
    </div>
  );
}

// ────── Variant D: 「sparkbar」, 高資訊密度,適合多 pipeline 場景 ──────
// 把 history dots、stage、elapsed 全收進一行 micro-status bar
function CardsSpark({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 16, overflow:"hidden" }}>
      <CardSectionLabel dark={dark}>D · Spark (一行 status)</CardSectionLabel>
      <CardRowLabel dark={dark}>STEP CARD</CardRowLabel>
      <CardD_Step dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · running</CardRowLabel>
      <CardD_Iter dark={dark} />
      <CardRowLabel dark={dark}>ITER CARD · paused</CardRowLabel>
      <CardD_Iter dark={dark} paused />
    </div>
  );
}

// ── helpers ──
function CardSectionLabel({ dark, children }) {
  return <div className="wf-hand" style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: dark?"#e7e3d8":"#1c1916" }}>{children}</div>;
}
function CardRowLabel({ dark, children }) {
  return <div className="wf-mono" style={{ fontSize: 9, opacity: .55, margin: "10px 0 4px", letterSpacing: 1, color: dark?"#e7e3d8":"#1c1916" }}>{children}</div>;
}

// ── A: standard ──
function CardA_Step({ dark }) {
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "10px 12px 10px 16px", fontSize: 11, lineHeight: 1.35, width: 280 }}>
      <span className="band band-blue" />
      <div style={{ display:"flex", alignItems:"flex-start", gap: 6 }}>
        <div style={{ flex: 1, fontWeight: 600 }}>route handlers</div>
        <span className="chip" style={{ fontSize: 9 }}>step</span>
      </div>
      <div className="wf-mono" style={{ opacity: .55, fontSize: 9, marginTop: 4 }}>ready · 等 OAuth 完成</div>
    </div>
  );
}
function CardA_Iter({ dark, paused }) {
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "10px 12px 11px 16px", fontSize: 11, lineHeight: 1.35, width: 280 }}>
      <span className={"band " + (paused ? "band-amber" : "band-indigo")} />
      <div style={{ display:"flex", alignItems:"flex-start", gap: 6 }}>
        <div style={{ flex: 1, fontWeight: 600 }}>OAuth flow 收斂</div>
        <span className="chip sk-fill-purple" style={{ fontSize: 9, borderColor:"transparent" }}>iter</span>
        {paused && <span style={{ color:"#c98a2a" }}>⏸</span>}
      </div>
      {/* history dots */}
      <div style={{ display:"flex", gap: 4, marginTop: 7, alignItems:"center" }}>
        <span className="wf-mono" style={{ fontSize: 9, opacity: .5, width: 30 }}>last 6</span>
        {(paused ? [1,1,0,-1,-1,-1] : [1,1,1,0,1,1]).map((d, i) => {
          const last = i === 5 && paused;
          return <span key={i} className={"pip pip-" + (d===1?"g":d===-1?"r":"a") + (last?" blink":"")} />;
        })}
      </div>
      {/* stage diagram */}
      <div style={{ display:"flex", alignItems:"center", gap: 5, marginTop: 7, fontSize: 9 }}>
        <span style={{ padding:"1px 6px", borderRadius: 3, border:"1px solid #1c1916" }}>doer</span>
        <span style={{ opacity:.5 }}>▶</span>
        <span className={paused?"":"pulse"} style={{ padding:"1px 6px", borderRadius: 3,
          background: dark?"#2a1f3a":"#e7dff2", border:"1px solid #1c1916", fontWeight: 600 }}>critic{paused ? " ⏸" : ""}</span>
        <span style={{ opacity:.5 }}>▶</span>
        <span style={{ padding:"1px 6px", border:"1px solid rgba(0,0,0,.25)", borderRadius: 3, opacity: .5 }}>✓</span>
      </div>
      <div className="wf-mono" style={{ fontSize: 9, opacity: .65, marginTop: 6 }}>
        Iter {paused ? 6 : 5} · {paused ? "04:18" : "03:42"} elapsed
      </div>
    </div>
  );
}

// ── B: compact sparkline ──
function CardB_Step({ dark }) {
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "8px 12px 8px 14px", fontSize: 11, width: 280 }}>
      <span className="band band-blue" style={{ width: 4 }} />
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <div style={{ flex: 1, fontWeight: 600 }}>route handlers</div>
        <span style={{ fontSize: 9, opacity:.5 }}>step</span>
        <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>ready</span>
      </div>
    </div>
  );
}
function CardB_Iter({ dark, paused }) {
  // sparkline: small inline SVG of verdict trajectory
  const data = paused ? [3,3,2,1,1,1] : [2,3,3,2,3,3];
  const stage = paused ? "⏸ critic" : "● critic";
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "9px 12px 10px 14px", fontSize: 11, width: 280 }}>
      <span className={"band " + (paused?"band-amber":"band-indigo")} style={{ width: 4 }} />
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <div style={{ flex: 1, fontWeight: 600 }}>OAuth flow 收斂</div>
        <span style={{ fontSize: 9, opacity:.6 }}>iter</span>
        {paused && <span style={{ color:"#c98a2a" }}>⏸</span>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap: 8, marginTop: 6, fontSize: 9 }}>
        {/* sparkline */}
        <svg width="60" height="16" viewBox="0 0 60 16">
          <polyline points={data.map((v,i) => `${i*12},${16 - v*4}`).join(" ")}
            fill="none" stroke={paused ? "#c98a2a" : "#3a8a4a"} strokeWidth="1.4" strokeLinejoin="round" />
          {data.map((v,i) => (
            <circle key={i} cx={i*12} cy={16-v*4} r={i===5?2.5:1.6}
              fill={paused && i===5 ? "#b04040" : (paused ? "#c98a2a" : "#3a8a4a")} />
          ))}
        </svg>
        <span className="wf-mono" style={{ opacity:.55 }}>verdict</span>
        <span style={{ flex: 1 }} />
        <span className="wf-mono" style={{ color: paused?"#c98a2a":(dark?"#a99cc6":"#4a4fb0") }}>{stage}</span>
      </div>
      <div className="wf-mono" style={{ fontSize: 9, opacity: .6, marginTop: 4 }}>
        Iter {paused ? 6 : 5} · {paused ? "04:18" : "03:42"}
      </div>
    </div>
  );
}

// ── C: ring metaphor ──
function CardC_Step({ dark }) {
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "10px 12px 10px 16px", fontSize: 11, width: 280, display:"flex", gap: 10 }}>
      <span className="band band-blue" />
      <div style={{ width: 32, height: 32, borderRadius: 16, border: "2px solid #3a6fb0",
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink: 0,
        fontSize: 9, fontWeight: 700, color:"#3a6fb0" }}>step</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>route handlers</div>
        <div className="wf-mono" style={{ opacity:.55, fontSize: 9, marginTop: 3 }}>ready · 等上游</div>
      </div>
    </div>
  );
}
function CardC_Iter({ dark, paused }) {
  const data = paused ? [1,1,0,-1,-1,-1] : [1,1,1,0,1,1];
  const colorFor = (d) => d===1?"#3a8a4a":d===-1?"#b04040":"#c98a2a";
  // 6 segments around a circle
  const segs = data.map((d, i) => {
    const a0 = (i / 6) * Math.PI * 2 - Math.PI/2;
    const a1 = ((i+1) / 6) * Math.PI * 2 - Math.PI/2 - 0.08;
    const r = 18, cx = 22, cy = 22;
    const x0 = cx + r*Math.cos(a0), y0 = cy + r*Math.sin(a0);
    const x1 = cx + r*Math.cos(a1), y1 = cy + r*Math.sin(a1);
    return <path key={i} d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`}
      stroke={colorFor(d)} strokeWidth={3.4} fill="none" strokeLinecap="round" />;
  });
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "10px 12px 10px 16px", fontSize: 11, width: 280, display:"flex", gap: 12 }}>
      <span className={"band " + (paused?"band-amber":"band-indigo")} />
      <div style={{ width: 44, height: 44, position:"relative", flexShrink: 0 }}>
        <svg width="44" height="44" viewBox="0 0 44 44">{segs}</svg>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center",
          fontSize: 8, fontWeight: 700, color: paused?"#c98a2a":(dark?"#a99cc6":"#4a4fb0"), lineHeight: 1, textAlign:"center" }}>
          {paused ? "⏸" : <>i{paused?6:5}<br/>{paused?"04:18":"03:42"}</>}
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
          <span style={{ fontWeight: 600, flex: 1 }}>OAuth flow 收斂</span>
          <span className="chip sk-fill-purple" style={{ fontSize: 9, borderColor:"transparent" }}>iter</span>
        </div>
        <div style={{ fontSize: 9, marginTop: 6, color: paused?"#c98a2a":"inherit" }}>
          {paused ? <><b>停滯 3 輪</b> — 等介入</> : <>doer ▶ <b>critic ●</b> ▶ ✓</>}
        </div>
        <div className="wf-mono" style={{ fontSize: 8, opacity:.55, marginTop: 4 }}>環外 6 段 = 最近 6 輪 verdict</div>
      </div>
    </div>
  );
}

// ── D: spark — single status row, max density ──
function CardD_Step({ dark }) {
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "6px 10px 6px 12px", fontSize: 11, width: 280, display:"flex", alignItems:"center", gap: 6 }}>
      <span className="band band-blue" style={{ width: 3 }} />
      <span style={{ flex: 1, fontWeight: 600 }}>route handlers</span>
      <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>step · ready</span>
    </div>
  );
}
function CardD_Iter({ dark, paused }) {
  const data = paused ? [1,1,0,-1,-1,-1] : [1,1,1,0,1,1];
  return (
    <div className="sk sk-thin" style={{ position:"relative", padding: "7px 10px 8px 12px", fontSize: 11, width: 280 }}>
      <span className={"band " + (paused?"band-amber":"band-indigo")} style={{ width: 3 }} />
      <div style={{ display:"flex", alignItems:"center", gap: 6 }}>
        <span style={{ flex: 1, fontWeight: 600 }}>OAuth flow 收斂</span>
        <span style={{ fontSize: 9, opacity:.6 }}>iter</span>
      </div>
      {/* one-line: dots + stage + elapsed */}
      <div style={{ display:"flex", alignItems:"center", gap: 3, marginTop: 5, fontSize: 9 }}>
        {data.map((d, i) => (
          <span key={i} className={"pip pip-" + (d===1?"g":d===-1?"r":"a") + (i===5 && paused?" blink":"")}
            style={{ width: 6, height: 6 }} />
        ))}
        <span style={{ opacity:.4, margin: "0 4px" }}>│</span>
        <span style={{ opacity:.5 }}>d</span>
        <span style={{ opacity:.5 }}>▶</span>
        <span className={paused?"":"pulse"} style={{ fontWeight: 700, color: paused?"#c98a2a":(dark?"#a99cc6":"#4a4fb0") }}>c</span>
        <span style={{ opacity:.5 }}>▶</span>
        <span style={{ opacity:.4 }}>✓</span>
        <span style={{ flex: 1 }} />
        <span className="wf-mono" style={{ opacity:.6 }}>i{paused?6:5} · {paused?"04:18":"03:42"}</span>
      </div>
    </div>
  );
}

Object.assign(window, { CardsStandard, CardsCompact, CardsRing, CardsSpark });

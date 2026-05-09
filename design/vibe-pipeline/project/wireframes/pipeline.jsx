// Pipeline creation — 3 variants of the ghost-column / +Pipeline interaction

// ── A: inline ghost column expand (per spec, Trello-style) ──
function PipelineGhost({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden" }}>
      <div className="wf-hand" style={{ fontSize: 14, fontWeight: 700, padding: "10px 12px",
        borderBottom: "1.5px solid " + (dark?"#3a3a40":"#1c1916") }}>A · Inline expand (board 上原地展開)</div>
      <div style={{ display:"flex", padding: 10, gap: 8, height: "calc(100% - 38px)", overflow: "hidden", boxSizing:"border-box" }}>
        {/* sibling cols (greyed) */}
        <FakeCol dark={dark} name="feat-auth" />
        <FakeCol dark={dark} name="feat-search" />
        {/* expanding ghost — focus + form */}
        <div className="sk" style={{ width: 200, flexShrink: 0, padding: 0,
          borderColor: "#9a82c2", borderWidth: 2,
          boxShadow: "0 4px 16px rgba(154,130,194,.3)" }}>
          <div style={{ padding: 10, borderBottom: "1.5px solid " + (dark?"#3a3a40":"#1c1916") }}>
            <div className="sk sk-thin sk-fill-warm" style={{ padding:"3px 6px", fontSize: 11, fontWeight: 600, marginBottom: 6,
              borderColor:"#9a82c2", background: dark?"#2a1f3a":"#e7dff2" }}>
              feat-billing<span className="blink" style={{ marginLeft:2 }}>▌</span>
            </div>
            <div style={{ display:"flex", gap: 4, fontSize: 9 }}>
              <span className="wf-mono" style={{ opacity:.55, alignSelf:"center" }}>base:</span>
              <span className="sk sk-thin" style={{ padding:"1px 5px", fontSize: 9 }}>main ▾</span>
              <span style={{ flex: 1 }} />
              <span className="sk sk-thin" style={{ padding:"1px 5px", fontSize: 9, opacity:.7 }}>squash ▾</span>
            </div>
            <div className="wf-mono" style={{ fontSize: 8, opacity:.5, marginTop: 5 }}>↵ save · esc cancel</div>
          </div>
          <div style={{ padding: 12, fontSize: 10, opacity:.5, textAlign:"center", fontStyle:"italic" }}>
            建好後第一張 ticket 立刻彈 Q&A
          </div>
        </div>
        {/* new ghost re-appears */}
        <div className="sk sk-thin sk-dash" style={{ width: 200, flexShrink: 0,
          display:"flex", alignItems:"center", justifyContent:"center", color: dark?"#7a7565":"#8a8478", fontSize: 11, opacity:.6 }}>
          + Add pipeline
        </div>
      </div>
    </div>
  );
}

// ── B: 浮層 modal 一次填多欄,適合複雜 pipeline ──
function PipelineModal({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", position:"relative" }}>
      <div className="wf-hand" style={{ fontSize: 14, fontWeight: 700, padding: "10px 12px",
        borderBottom: "1.5px solid " + (dark?"#3a3a40":"#1c1916") }}>B · Modal (一次填完整 config)</div>
      {/* dimmed board */}
      <div style={{ display:"flex", padding: 10, gap: 8, opacity: .35, height: "calc(100% - 38px)", overflow:"hidden" }}>
        <FakeCol dark={dark} name="feat-auth" />
        <FakeCol dark={dark} name="feat-search" />
        <FakeCol dark={dark} name="refactor-api" />
      </div>
      <div style={{ position:"absolute", inset: 0, background:"rgba(20,18,14,.4)" }} />
      <div className="sk" style={{ position:"absolute", top: 50, left: "50%", transform:"translateX(-50%)",
        width: 280, padding: 14, background: dark?"#1d2025":"#fff", boxShadow:"0 12px 40px rgba(0,0,0,.25)" }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>建立新 pipeline</div>
        <FormRow dark={dark} label="name">
          <span className="sk sk-thin" style={{ padding:"3px 6px", fontSize: 10, flex: 1, background: dark?"#14161a":"#fbf8f1" }}>feat-billing<span className="blink">▌</span></span>
        </FormRow>
        <FormRow dark={dark} label="base">
          <span className="sk sk-thin" style={{ padding:"3px 6px", fontSize: 10, flex: 1 }}>main ▾</span>
        </FormRow>
        <FormRow dark={dark} label="merge">
          <span className="sk sk-thin" style={{ padding:"3px 6px", fontSize: 10, flex: 1 }}>squash ▾</span>
        </FormRow>
        <FormRow dark={dark} label="auto-merge">
          <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 9 }}>○ off</span>
          <span className="sk sk-thin sk-fill-purple" style={{ padding:"2px 6px", fontSize: 9 }}>● on</span>
        </FormRow>
        <FormRow dark={dark} label="第一張">
          <span className="sk sk-thin" style={{ padding:"2px 6px", fontSize: 9 }}>建空 column</span>
          <span className="sk sk-thin sk-fill-purple" style={{ padding:"2px 6px", fontSize: 9 }}>● 開 Q&A</span>
        </FormRow>
        <div style={{ display:"flex", gap: 6, marginTop: 12 }}>
          <span style={{ flex:1 }} />
          <span className="sk sk-thin" style={{ padding:"4px 10px", fontSize: 10 }}>Cancel</span>
          <span className="sk sk-thin sk-fill-purple" style={{ padding:"4px 10px", fontSize: 10, fontWeight: 600 }}>Create</span>
        </div>
      </div>
    </div>
  );
}

// ── C: command palette ⌘K 風 ──
// 鍵盤友善,輸入名字 → 下面候選參數 (base / merge / 從 issue 建)
function PipelinePalette({ dark }) {
  return (
    <div className={"wf-board " + (dark?"dark":"")} style={{ padding: 0, overflow:"hidden", position:"relative" }}>
      <div className="wf-hand" style={{ fontSize: 14, fontWeight: 700, padding: "10px 12px",
        borderBottom: "1.5px solid " + (dark?"#3a3a40":"#1c1916") }}>C · Command palette (⌘K)</div>
      <div style={{ display:"flex", padding: 10, gap: 8, opacity: .25, height: "calc(100% - 38px)", overflow:"hidden" }}>
        <FakeCol dark={dark} name="feat-auth" />
        <FakeCol dark={dark} name="feat-search" />
      </div>
      <div style={{ position:"absolute", inset: 0, background:"rgba(20,18,14,.5)" }} />
      <div className="sk" style={{ position:"absolute", top: 60, left: "50%", transform:"translateX(-50%)",
        width: 320, padding: 0, background: dark?"#1d2025":"#fff", boxShadow:"0 12px 40px rgba(0,0,0,.3)" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid " + (dark?"#3a3a40":"#dcd6c8"), display:"flex", alignItems:"center", gap: 8 }}>
          <span style={{ opacity:.5 }}>⎇</span>
          <span style={{ flex: 1, fontSize: 12 }}>new pipeline <b>billing</b><span className="blink">▌</span></span>
          <span className="wf-mono" style={{ fontSize: 9, opacity:.5 }}>⌘K</span>
        </div>
        <div style={{ padding: 6 }}>
          <PaletteRow dark={dark} active>
            <span style={{ width:18, height:18, borderRadius:4, background:"#9a82c2", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10 }}>+</span>
            <span style={{ flex: 1 }}>建立 <b>feat-billing</b> · base: <span className="wf-mono">main</span> · squash</span>
            <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>↵</span>
          </PaletteRow>
          <PaletteRow dark={dark}>
            <span style={{ width:18, height:18, borderRadius:4, background: dark?"#3a3a40":"#efeae0", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10 }}>⎇</span>
            <span style={{ flex: 1 }}>建立 + 改 base → <span className="wf-mono">…</span></span>
            <span className="wf-mono" style={{ fontSize: 9, opacity:.55 }}>tab</span>
          </PaletteRow>
          <PaletteRow dark={dark}>
            <span style={{ width:18, height:18, borderRadius:4, background: dark?"#3a3a40":"#efeae0", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10 }}>📋</span>
            <span style={{ flex: 1 }}>從 GitHub issue 建 → <span className="wf-mono">paste URL</span></span>
          </PaletteRow>
          <PaletteRow dark={dark}>
            <span style={{ width:18, height:18, borderRadius:4, background: dark?"#3a3a40":"#efeae0", display:"flex", alignItems:"center", justifyContent:"center", fontSize: 10 }}>📐</span>
            <span style={{ flex: 1 }}>用 template <span className="wf-mono">crud-feature</span></span>
          </PaletteRow>
        </div>
      </div>
    </div>
  );
}

// helpers
function FakeCol({ dark, name }) {
  return (
    <div className="sk sk-thin" style={{ width: 140, flexShrink: 0, padding: 0 }}>
      <div style={{ padding: "5px 7px", fontSize: 10, fontWeight: 700, borderBottom: "1px solid " + (dark?"#3a3a40":"#1c1916") }}>{name}</div>
      <div style={{ padding: 5, display:"flex", flexDirection:"column", gap: 4 }}>
        <div className="sk sk-thin" style={{ padding:"4px 5px 4px 8px", position:"relative", height: 14 }}>
          <span className="band band-green" style={{ width: 3 }} /><span className="squig short" style={{ width: 60, height: 4 }} />
        </div>
        <div className="sk sk-thin" style={{ padding:"4px 5px 4px 8px", position:"relative", height: 14 }}>
          <span className="band band-blue" style={{ width: 3 }} /><span className="squig short" style={{ width: 50, height: 4 }} />
        </div>
        <div className="sk sk-thin" style={{ padding:"4px 5px 4px 8px", position:"relative", height: 14 }}>
          <span className="band band-gray" style={{ width: 3 }} /><span className="squig short" style={{ width: 40, height: 4 }} />
        </div>
      </div>
    </div>
  );
}
function FormRow({ dark, label, children }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap: 8, marginBottom: 7 }}>
      <span className="wf-mono" style={{ fontSize: 9, opacity:.6, width: 64 }}>{label}</span>
      {children}
    </div>
  );
}
function PaletteRow({ dark, active, children }) {
  return (
    <div className="sk sk-thin" style={{
      padding: "6px 8px", marginBottom: 3, fontSize: 11, display:"flex", alignItems:"center", gap: 8,
      background: active ? (dark?"#2a1f3a":"#e7dff2") : "transparent",
      borderColor: active ? "#9a82c2" : "transparent",
    }}>{children}</div>
  );
}

Object.assign(window, { PipelineGhost, PipelineModal, PipelinePalette });

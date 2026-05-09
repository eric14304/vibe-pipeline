// Ticket Q&A — chat-driven ticket creation with live draft sidebar
// 3 variants: chat-side (default) / form-first / stepwise
const { useState: useS, useEffect: useE, useRef: useR, useMemo: useM, Fragment: F } = React;

/* ─────── scripted conversation ───────
   Each turn:
     - ai prompt
     - optional quick replies (taps -> auto-advance to user message)
     - user message that lands when replied/typed
     - draft mutation: which fields filled in, what values
*/
const TURNS = [
  {
    id: "intro",
    ai: "想做什麼?簡單描述就好,我會邊聊邊幫你把 ticket 草稿撐起來。",
    placeholder: "ex. 加 Google 登入,session 用 cookie 記 7 天",
    quickReplies: null,
    userDefault: "想加 Google 登入,session cookie 撐 7 天",
    draftAfter: {
      title:  "Google 登入 (草擬中)",
      goal:   "使用者用 Google 帳號登入,session 用 cookie 維持 7 天",
    },
    highlight: ["title", "goal"],
  },
  {
    id: "criteria",
    ai: "好喔。「成功」的判定是?越具體越好 — 我先丟個草稿,你再修。",
    aiSuggestion: {
      head: "建議 acceptance criteria",
      items: [
        "/auth/google redirect 進 Google 同意頁",
        "callback 寫入 session cookie (7d, httpOnly, sameSite=lax)",
        "/me 回傳當前 user.email",
        "登出端點清掉 cookie",
      ],
    },
    quickReplies: [
      { label: "都對,直接用", value: "都對,直接用" },
      { label: "拿掉登出", value: "前三個就好,登出之後再說" },
      { label: "我自己寫", value: null },
    ],
    placeholder: "例如:能 redirect 回首頁、/me 回正確 user…",
    userDefault: "都對,直接用",
    draftAfter: {
      acceptance: [
        "/auth/google redirect 進 Google 同意頁",
        "callback 寫入 session cookie (7d, httpOnly, sameSite=lax)",
        "/me 回傳當前 user.email",
        "登出端點清掉 cookie",
      ],
    },
    highlight: ["acceptance"],
  },
  {
    id: "mode",
    ai: "OAuth 設定通常一次到位 — 我建議用 step (一次完成)。要不要改 iter?",
    quickReplies: [
      { label: "step (建議)", value: "step 就好" },
      { label: "iter 多輪打磨", value: "用 iter,我想多看幾版" },
    ],
    userDefault: "step 就好",
    draftAfter: { mode: "step" },
    highlight: ["mode"],
  },
  {
    id: "doer",
    ai: "預設 doer 是 claude-sonnet,critic 是 gpt-4o。要動嗎?",
    quickReplies: [
      { label: "用預設", value: "預設就好" },
      { label: "doer 換 haiku", value: "doer 用 haiku,省一點" },
      { label: "我自己選", value: null },
    ],
    userDefault: "預設就好",
    draftAfter: { doer: "claude-sonnet（預設）", critic: "gpt-4o（預設）" },
    highlight: ["doer"],
  },
  {
    id: "deps",
    ai: "有沒有上游依賴?例如要先有 user table、要存進現有 db?",
    quickReplies: [
      { label: "沒有,獨立寫", value: "沒有,獨立寫" },
      { label: "依 #1 (DB schema)", value: "等 #1 DB schema 完成" },
    ],
    placeholder: "可以填 ticket 編號或描述",
    userDefault: "等 #1 DB schema 完成",
    draftAfter: { deps: "#1 DB schema 設計" },
    highlight: ["deps"],
  },
  {
    id: "wrap",
    ai: "差不多了。要直接建 ticket,還是再追一兩個細節?",
    quickReplies: [
      { label: "建 ticket → 開工", value: "建,開工", action: "save" },
      { label: "再聊兩句", value: "我想多聊幾句邊界 case" },
    ],
    userDefault: null,
  },
];

const FIELD_DEFS = [
  { key: "title", label: "標題", placeholder: "(等資訊…)" },
  { key: "goal", label: "目標", placeholder: "(等資訊…)" },
  { key: "acceptance", label: "驗收條件", placeholder: "(列點)", isList: true, isCheckable: true },
  { key: "mode", label: "執行模式", placeholder: "(step | iter)", isMode: true },
  { key: "doer", label: "模型分配", placeholder: "(等資訊…)", isPair: true, pairKey: "critic" },
  { key: "deps", label: "依賴於", placeholder: "(可選)" },
];

/* ───────── component ───────── */
function QAScreen({ variant = "chat", autoplay = true, density = "medium" }) {
  const [turnIdx, setTurnIdx] = useS(0);
  const [history, setHistory] = useS([]); // array of { from, text, suggestion?, quickReplies?, turnId }
  const [draft, setDraft] = useS({});
  const [highlight, setHighlight] = useS({});
  const [aiTyping, setAiTyping] = useS(false);
  const [showQR, setShowQR] = useS(false);
  const [composerVal, setComposerVal] = useS("");
  const [savedDone, setSavedDone] = useS(false);

  const scrollRef = useR(null);
  const composerRef = useR(null);

  // emit one turn (ai message + quick replies) — call when ready to advance
  function emitTurn(idx) {
    const turn = TURNS[idx];
    if (!turn) return;
    setAiTyping(true);
    setShowQR(false);
    const aiDelay = idx === 0 ? 200 : 700;
    setTimeout(() => {
      setHistory((h) => [
        ...h,
        {
          from: "ai",
          text: turn.ai,
          suggestion: turn.aiSuggestion,
          turnId: turn.id,
        },
      ]);
      setAiTyping(false);
      setTimeout(() => setShowQR(true), 220);
    }, aiDelay);
  }

  // initial kickoff
  useE(() => {
    emitTurn(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-scroll chat
  useE(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history.length, aiTyping, showQR]);

  // simulate user reply
  function answer(text, action) {
    if (text == null) return; // means "let user type"
    const turn = TURNS[turnIdx];
    setHistory((h) => [...h, { from: "me", text, turnId: turn.id }]);
    setShowQR(false);
    setComposerVal("");

    // animate field fill ~300ms after user message
    setTimeout(() => {
      if (turn.draftAfter) {
        setDraft((d) => ({ ...d, ...turn.draftAfter }));
      }
      if (turn.highlight) {
        const h = {};
        turn.highlight.forEach((k) => (h[k] = Date.now()));
        setHighlight((prev) => ({ ...prev, ...h }));
      }
    }, 360);

    if (action === "save") {
      setTimeout(() => setSavedDone(true), 1200);
      return;
    }

    // advance to next turn
    const next = turnIdx + 1;
    if (next < TURNS.length) {
      setTurnIdx(next);
      setTimeout(() => emitTurn(next), 800);
    }
  }

  function onSubmit(e) {
    e?.preventDefault();
    const txt = composerVal.trim();
    if (!txt) return;
    answer(txt);
  }

  // current turn meta (for composer placeholder + quick replies)
  const currentTurn = TURNS[turnIdx] || {};
  const lastAi = history.length && history[history.length - 1].from === "ai";
  const canShowQR = showQR && lastAi && !aiTyping && currentTurn.quickReplies;
  const composerPh = currentTurn.placeholder || "回覆…";

  /* ───── shared TopBar ───── */
  const Head = (
    <header className="qa-head">
      <a className="qa-head-back" href="Prototype - Board.html" title="返回看板">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="m14 6-6 6 6 6" /></svg>
        <span>看板</span>
      </a>
      <span className="qa-head-sep" />
      <span className="qa-head-eyebrow mono">new ticket</span>
      <span className="qa-head-pipeline">
        <span className="dot" /> feat-auth
        <span className="chip mono" style={{ marginLeft: 4 }}>
          <span style={{ color: "var(--fg-mute)" }}>⎇</span> pipeline/feat-auth
        </span>
      </span>
      <div className="qa-head-right">
        <span className="qa-cost mono">
          <DollarIcon /> <strong>$0.014</strong> · 6 turns
        </span>
        <button className="icon-btn" title="關閉 (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
    </header>
  );

  if (variant === "drawer")
    return (
      <DrawerVariant
        history={history} aiTyping={aiTyping} canShowQR={canShowQR}
        currentTurn={currentTurn} answer={answer} composerVal={composerVal}
        setComposerVal={setComposerVal} onSubmit={onSubmit} composerPh={composerPh}
        scrollRef={scrollRef} draft={draft} highlight={highlight}
        savedDone={savedDone}
      />
    );

  if (variant === "form")
    return (
      <div className="qa-root">
        {Head}
        <div className="qa-body variant-form">
          <FormVariant draft={draft} highlight={highlight} composerPh={composerPh} onSubmit={onSubmit}
            composerVal={composerVal} setComposerVal={setComposerVal}
            currentTurn={currentTurn} answer={answer} aiTyping={aiTyping} canShowQR={canShowQR}
            history={history} savedDone={savedDone} />
        </div>
      </div>
    );

  if (variant === "step")
    return (
      <div className="qa-root">
        {Head}
        <div className="qa-body variant-step">
          <StepVariant turnIdx={turnIdx} answer={answer} draft={draft}
            composerVal={composerVal} setComposerVal={setComposerVal} savedDone={savedDone} />
        </div>
      </div>
    );

  if (variant === "drawer")
    return (
      <div className="qa-root">
        {Head}
        <div className="qa-body variant-drawer">
          <DrawerVariant
            history={history} aiTyping={aiTyping} canShowQR={canShowQR}
            currentTurn={currentTurn} answer={answer}
            composerVal={composerVal} setComposerVal={setComposerVal}
            composerPh={composerPh} onSubmit={onSubmit} savedDone={savedDone}
            draft={draft} highlight={highlight} />
        </div>
      </div>
    );

  // ─── default: chat + draft sidebar ───
  return (
    <div className="qa-root">
      {Head}
      <div className="qa-body">
        {/* chat */}
        <section className="qa-chat">
          <div className="qa-chat-scroll" ref={scrollRef}>
            <div className="qa-chat-inner">
              {history.map((m, i) => (
                <F key={i}>
                  <Msg msg={m} />
                </F>
              ))}
              {aiTyping && (
                <div className="qa-typing">
                  <div className="qa-typing-dots"><span /><span /><span /></div>
                  <span>AI 在想…</span>
                </div>
              )}
              {canShowQR && currentTurn.quickReplies && (
                <div className="qa-quickreplies">
                  <span className="qa-qr-label">快速回覆 ·</span>
                  {currentTurn.quickReplies.map((qr, i) => (
                    <button key={i} className="qa-qr" onClick={() => answer(qr.value ?? null, qr.action)}>
                      {qr.label}
                    </button>
                  ))}
                </div>
              )}
              {savedDone && (
                <div className="qa-msg from-ai">
                  <span className="qa-msg-avatar" style={{ background: "var(--done-soft)", color: "var(--done)", borderColor: "color-mix(in srgb, var(--done) 30%, transparent)" }}>✓</span>
                  <div className="qa-msg-bubble" style={{ background: "var(--done-soft)", borderColor: "color-mix(in srgb, var(--done) 30%, transparent)" }}>
                    Ticket #{6} 已建立 · 開始排程 doer。<br />
                    <a href="Prototype - Board.html" style={{ color: "var(--done)", textDecoration: "underline", textDecorationColor: "color-mix(in srgb, var(--done) 40%, transparent)" }}>← 回看板查看</a>
                  </div>
                </div>
              )}
            </div>
          </div>
          <Composer value={composerVal} onChange={setComposerVal} onSubmit={onSubmit}
            placeholder={composerPh} ref={composerRef} disabled={savedDone} />
        </section>

        {/* draft */}
        <aside className="qa-draft">
          <div className="qa-draft-head">
            <span className="qa-draft-eyebrow">草稿 · ticket #6</span>
            <span style={{ flex: 1 }} />
            <span className="qa-draft-pulse-label mono">填入中</span>
            <span className="qa-draft-pulse" />
          </div>
          <div className="qa-draft-list">
            {FIELD_DEFS.map((def) => (
              <DraftField key={def.key} def={def} value={draft[def.key]}
                pair={def.isPair ? draft[def.pairKey] : null}
                justFilled={highlight[def.key]} />
            ))}
          </div>
          <div className="qa-draft-foot">
            <DraftProgress draft={draft} />
            <div className="qa-draft-actions">
              <button className="btn">跳過問答</button>
              <button className={"btn btn-primary"} disabled={!draft.title || !draft.goal || !draft.acceptance}
                onClick={() => answer("建,開工", "save")}>
                <PlusIcon /> 建立 ticket
              </button>
            </div>
            {(!draft.title || !draft.goal || !draft.acceptance) && (
              <div className="qa-save-disabled-hint">需要填完 標題 · 目標 · 驗收條件 才能建</div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ──── chat msg ──── */
function Msg({ msg }) {
  if (msg.from === "ai") {
    return (
      <div className="qa-msg from-ai">
        <span className="qa-msg-avatar">AI</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "80%" }}>
          <div className="qa-msg-bubble">{msg.text}</div>
          {msg.suggestion && <SuggestionCard sug={msg.suggestion} />}
        </div>
      </div>
    );
  }
  return (
    <div className="qa-msg from-me">
      <div className="qa-msg-bubble">{msg.text}</div>
    </div>
  );
}

function SuggestionCard({ sug }) {
  return (
    <div style={{
      background: "var(--accent-soft)",
      border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)",
      borderRadius: 10, padding: "9px 12px",
      animation: "fadeUp 320ms ease-out 100ms both",
    }}>
      <div className="mono" style={{ fontSize: 10, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>
        {sug.head}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
        {sug.items.map((it, i) => (
          <li key={i} className="mono" style={{ fontSize: 11.5, color: "var(--fg)", paddingLeft: 14, position: "relative", lineHeight: 1.5 }}>
            <span style={{ position: "absolute", left: 0, color: "var(--fg-faint)" }}>[ ]</span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ──── composer ──── */
const Composer = React.forwardRef(function Composer({ value, onChange, onSubmit, placeholder, disabled }, ref) {
  const taRef = useR(null);
  React.useImperativeHandle(ref, () => taRef.current);
  function onKey(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  }
  return (
    <form className="qa-composer" onSubmit={onSubmit}>
      <div className="qa-composer-inner">
        <div className="qa-input">
          <textarea
            ref={taRef}
            value={value}
            disabled={disabled}
            placeholder={disabled ? "已建立 ticket。" : placeholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKey}
            rows={1}
          />
          <button className="qa-input-send" disabled={!value.trim() || disabled} title="送出 (↵)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          </button>
        </div>
        <div className="qa-composer-meta">
          <span className="mono">↵ 送出</span>
          <span className="mono">⇧↵ 換行</span>
          <span className="qa-meta-spacer" />
          <button type="button" className="qa-meta-skip">跳過 Q&A,直接編輯草稿 →</button>
        </div>
      </div>
    </form>
  );
});

/* ──── draft field ──── */
function DraftField({ def, value, pair, justFilled }) {
  const hasValue = value != null && value !== "";
  const isJust = justFilled && Date.now() - justFilled < 1500;
  // re-render to clear highlight
  const [, force] = useS(0);
  useE(() => {
    if (!justFilled) return;
    const t = setTimeout(() => force((n) => n + 1), 1500);
    return () => clearTimeout(t);
  }, [justFilled]);

  return (
    <div className={"qa-field" + (!hasValue ? " is-empty" : "") + (isJust ? " is-just-filled" : "")}>
      <div className="qa-field-head">
        <span className="qa-field-label">{def.label}</span>
        {isJust && <span className="qa-field-tag">AI 剛填</span>}
      </div>
      {!hasValue ? (
        <div className="qa-field-value">{def.placeholder}</div>
      ) : def.isList ? (
        <ul className="qa-field-list">
          {value.map((v, i) => (
            <li key={i}>{v}</li>
          ))}
        </ul>
      ) : def.isMode ? (
        <div className="qa-field-value">
          <span className={"qa-field-mode-tag " + value}>{value}</span>
          <span style={{ marginLeft: 8, color: "var(--fg-mute)", fontSize: 11.5 }}>
            {value === "step" ? "一次完成" : "doer × critic 多輪"}
          </span>
        </div>
      ) : def.isPair ? (
        <div className="qa-field-value mono" style={{ fontSize: 12, lineHeight: 1.6 }}>
          <div><span style={{ color: "var(--fg-mute)" }}>執行者</span> · <span style={{ color: "var(--fg)" }}>{value}</span></div>
          <div style={{ color: "var(--fg-mute)" }}>審核者 · <span style={{ color: pair && pair !== "—" ? "var(--fg)" : "var(--fg-faint)" }}>{pair || "—"}</span></div>
        </div>
      ) : (
        <div className="qa-field-value">{value}</div>
      )}
    </div>
  );
}

function DraftProgress({ draft }) {
  const total = FIELD_DEFS.length;
  const done = FIELD_DEFS.filter((d) => {
    const v = draft[d.key];
    return v != null && v !== "" && (!Array.isArray(v) || v.length > 0);
  }).length;
  const pct = Math.round((done / total) * 100);
  return (
    <div className="qa-draft-progress">
      <span className="mono">{done}/{total}</span>
      <span className="qa-draft-progress-bar"><span style={{ width: pct + "%" }} /></span>
      <span className="mono">{pct}%</span>
    </div>
  );
}

/* ──── Variant B: form-first ──── */
function FormVariant({ draft, highlight, composerPh, currentTurn, answer, aiTyping, canShowQR, savedDone }) {
  return (
    <>
      <main className="qa-form">
        <div className="qa-form-scroll">
          <div className="qa-form-inner">
            <div>
              <h2 className="qa-form-title">新 ticket · feat-auth</h2>
              <p className="qa-form-sub">直接編輯欄位,下面 AI 教練會提醒下一個該填的。</p>
            </div>
            <FormField label="title" value={draft.title || ""} highlight={highlight.title} placeholder="例如: Google OAuth 登入" />
            <FormField label="goal" value={draft.goal || ""} highlight={highlight.goal} placeholder="一句話描述完成後使用者體驗。" multi />
            <FormField label="acceptance criteria" value={(draft.acceptance || []).join("\n")} highlight={highlight.acceptance} placeholder="一行一條,可勾選。" multi rows={5} mono />
            <div className="qa-form-row">
              <FormField label="mode" value={draft.mode || ""} highlight={highlight.mode} placeholder="step | iter" mono />
              <FormField label="depends on" value={draft.deps || ""} highlight={highlight.deps} placeholder="可填 ticket 編號" />
            </div>
            <FormField label="doer / critic" value={draft.doer || ""} highlight={highlight.doer} placeholder="claude-sonnet (預設)" mono />
            {savedDone && (
              <div style={{
                background: "var(--done-soft)",
                border: "1px solid color-mix(in srgb, var(--done) 30%, transparent)",
                borderRadius: 10, padding: 14, color: "var(--fg)", fontSize: 13,
              }}>
                ✓ Ticket #6 已建立 · <a href="Prototype - Board.html" style={{ color: "var(--done)" }}>回看板</a>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* AI coach bar */}
      <div className="qa-coach">
        <span className="qa-coach-avatar">AI</span>
        <div className="qa-coach-text">
          {aiTyping ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span className="qa-typing-dots"><span /><span /><span /></span>
              想下一題…
            </span>
          ) : savedDone ? (
            "搞定 — 看板那邊已經開始 doer 了。"
          ) : (
            "「" + (currentTurn.ai || "") + "」"
          )}
        </div>
        <div className="qa-coach-actions">
          {canShowQR && currentTurn.quickReplies?.slice(0, 3).map((qr, i) => (
            <button key={i} className="btn" onClick={() => answer(qr.value ?? null, qr.action)}>{qr.label}</button>
          ))}
          {!savedDone && !canShowQR && !aiTyping && (
            <button className="btn btn-primary" onClick={() => answer("建,開工", "save")}>建立 ticket ↵</button>
          )}
        </div>
      </div>
    </>
  );
}

function FormField({ label, value, highlight, placeholder, multi, rows = 3, mono }) {
  const [val, setVal] = useS(value);
  useE(() => { setVal(value); }, [value]);
  const isJust = highlight && Date.now() - highlight < 1500;
  const [, force] = useS(0);
  useE(() => {
    if (!highlight) return;
    const t = setTimeout(() => force((n) => n + 1), 1500);
    return () => clearTimeout(t);
  }, [highlight]);
  return (
    <div className={"qa-form-field" + (isJust ? " is-suggested" : "")}>
      <label className="qa-form-field-label">
        {label}
        {isJust && <span className="qa-form-field-pill">AI 剛填</span>}
      </label>
      {multi ? (
        <textarea
          className={"qa-form-textarea" + (mono ? " mono" : "")}
          value={val}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
        />
      ) : (
        <input
          className={"qa-form-input" + (mono ? " mono" : "")}
          value={val}
          placeholder={placeholder}
          onChange={(e) => setVal(e.target.value)}
        />
      )}
    </div>
  );
}

/* ──── Variant C: stepwise ──── */
function StepVariant({ turnIdx, answer, draft, composerVal, setComposerVal, savedDone }) {
  const turn = TURNS[Math.min(turnIdx, TURNS.length - 1)] || TURNS[0];
  const total = TURNS.length;
  const pct = Math.round(((turnIdx + 1) / total) * 100);
  const minLeft = Math.max(0, Math.ceil((total - turnIdx - 1) * 0.4));

  function go() {
    const v = composerVal.trim();
    if (!v && !turn.userDefault) return;
    answer(v || turn.userDefault);
    setComposerVal("");
  }

  if (savedDone)
    return (
      <div className="qa-step-shell">
        <div className="qa-step-card" style={{ alignItems: "center", textAlign: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 48, color: "var(--done)" }}>✓</div>
          <h2 className="qa-step-question" style={{ fontSize: 22 }}>Ticket #6 已建立</h2>
          <p className="qa-step-hint">doer 已經排程,看板那邊會即時更新。</p>
          <a href="Prototype - Board.html" className="btn btn-primary" style={{ marginTop: 12, alignSelf: "center" }}>← 回看板</a>
        </div>
      </div>
    );

  return (
    <div className="qa-step-shell">
      <div className="qa-step-progress">
        <span className="num mono">{turnIdx + 1} / {total}</span>
        <span className="bar"><span style={{ width: pct + "%" }} /></span>
        <span className="est mono">~{minLeft} min left</span>
      </div>
      <div className="qa-step-card" key={turn.id}>
        <span className="qa-step-eyebrow mono">Q{turnIdx + 1} · {turn.id}</span>
        <h2 className="qa-step-question">{turn.ai}</h2>
        {turn.aiSuggestion && (
          <p className="qa-step-hint" style={{ color: "var(--accent)" }}>
            建議:{turn.aiSuggestion.items.slice(0, 2).join(" · ")}…
          </p>
        )}
        {turn.placeholder && <p className="qa-step-hint">{turn.placeholder}</p>}
        {turn.quickReplies && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {turn.quickReplies.map((qr, i) => (
              <button key={i} className="qa-qr" style={{ padding: "8px 16px", fontSize: 13 }}
                onClick={() => answer(qr.value ?? null, qr.action)}>
                {qr.label}
              </button>
            ))}
          </div>
        )}
        {!turn.quickReplies && (
          <textarea className="qa-step-input"
            value={composerVal}
            onChange={(e) => setComposerVal(e.target.value)}
            placeholder={turn.placeholder || "輸入答案…"}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } }} />
        )}
        {turnIdx > 0 && (
          <div className="qa-step-recap">
            <div className="qa-step-recap-head mono">前面回答了…</div>
            {draft.title && <div className="qa-step-recap-row"><span className="lbl">title</span><strong>{draft.title}</strong></div>}
            {draft.goal && <div className="qa-step-recap-row"><span className="lbl">goal</span>{draft.goal}</div>}
            {draft.mode && <div className="qa-step-recap-row"><span className="lbl">mode</span><strong>{draft.mode}</strong></div>}
          </div>
        )}
      </div>
      <div className="qa-step-foot">
        <button className="qa-step-back btn-ghost" disabled={turnIdx === 0}>← 上一題</button>
        <span className="spacer" />
        <span className="hint">⌘↵ 下一題</span>
        <button className="next" onClick={go}>
          {turnIdx === TURNS.length - 1 ? "建立 ticket" : "下一題"}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </div>
  );
}

/* ──── Variant D: drawer (slide-in over board) ──── */
function DrawerVariant({ history, aiTyping, canShowQR, currentTurn, answer,
  composerVal, setComposerVal, composerPh, onSubmit, savedDone, draft, highlight }) {
  const scrollRef = useR(null);
  const [draftOpen, setDraftOpen] = useS(true);

  useE(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [history.length, aiTyping, canShowQR]);

  const filled = FIELD_DEFS.filter((d) => {
    const v = draft[d.key];
    return v != null && v !== "" && (!Array.isArray(v) || v.length > 0);
  });
  const total = FIELD_DEFS.length;
  const pct = Math.round((filled.length / total) * 100);

  return (
    <>
      {/* board mock behind */}
      <div className="qa-drawer-backdrop" aria-hidden="true">
        <div className="qa-dbg-rail">
          <div className="qa-dbg-rail-item s-paused"></div>
          <div className="qa-dbg-rail-item s-running"></div>
          <div className="qa-dbg-rail-item s-done"></div>
          <div className="qa-dbg-rail-item s-draft"></div>
          <div className="qa-dbg-rail-item is-ghost"></div>
        </div>
        <div className="qa-dbg-focus">
          <div className="qa-dbg-focus-title"></div>
          <div className="qa-dbg-ticket"></div>
          <div className="qa-dbg-ticket p"></div>
          <div className="qa-dbg-ticket r"></div>
          <div className="qa-dbg-ticket d"></div>
          <div className="qa-dbg-ticket d"></div>
        </div>
      </div>
      <div className="qa-drawer-scrim" aria-hidden="true" />

      {/* drawer panel */}
      <aside className="qa-drawer">
        <header className="qa-drawer-head">
          <div className="qa-drawer-head-l">
            <span className="qa-drawer-eyebrow mono">new ticket · feat-auth</span>
            <h3 className="qa-drawer-title">Ticket Q&amp;A</h3>
          </div>
          <button className="icon-btn" title="關閉 (Esc)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </header>

        {/* draft progress strip (collapsible) */}
        <div className={"qa-drawer-draft" + (draftOpen ? " is-open" : "")}>
          <button className="qa-drawer-draft-head" onClick={() => setDraftOpen(o => !o)}>
            <span className="qa-drawer-draft-eyebrow mono">draft</span>
            <span className="qa-drawer-draft-progress">
              <span className="bar"><span style={{ width: pct + "%" }} /></span>
              <span className="mono">{filled.length}/{total}</span>
            </span>
            <span className="qa-drawer-draft-pulse" />
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: draftOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {draftOpen && (
            <div className="qa-drawer-draft-body">
              {FIELD_DEFS.map((def) => {
                const v = draft[def.key];
                const has = v != null && v !== "" && (!Array.isArray(v) || v.length > 0);
                const isJust = highlight[def.key] && Date.now() - highlight[def.key] < 1500;
                return (
                  <div key={def.key} className={"qa-drawer-chip" + (has ? " is-filled" : "") + (isJust ? " is-just" : "")}>
                    <span className="qa-drawer-chip-dot" />
                    <span className="qa-drawer-chip-label mono">{def.label}</span>
                    {has && (
                      <span className="qa-drawer-chip-val">
                        {Array.isArray(v) ? v.length + " 條" : (typeof v === "string" && v.length > 22 ? v.slice(0, 22) + "…" : v)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* chat */}
        <div className="qa-drawer-chat" ref={scrollRef}>
          {history.map((m, i) => (
            <F key={i}><Msg msg={m} /></F>
          ))}
          {aiTyping && (
            <div className="qa-typing">
              <div className="qa-typing-dots"><span /><span /><span /></div>
              <span>AI 在想…</span>
            </div>
          )}
          {canShowQR && currentTurn.quickReplies && (
            <div className="qa-quickreplies" style={{ paddingLeft: 38 }}>
              {currentTurn.quickReplies.map((qr, i) => (
                <button key={i} className="qa-qr" onClick={() => answer(qr.value ?? null, qr.action)}>
                  {qr.label}
                </button>
              ))}
            </div>
          )}
          {savedDone && (
            <div className="qa-msg from-ai">
              <span className="qa-msg-avatar" style={{ background: "var(--done-soft)", color: "var(--done)", borderColor: "color-mix(in srgb, var(--done) 30%, transparent)" }}>✓</span>
              <div className="qa-msg-bubble" style={{ background: "var(--done-soft)", borderColor: "color-mix(in srgb, var(--done) 30%, transparent)" }}>
                Ticket #6 已建立 · 開始排程 doer。<br />
                <a href="Prototype - Board.html" style={{ color: "var(--done)", textDecoration: "underline" }}>← 回看板查看</a>
              </div>
            </div>
          )}
        </div>

        {/* composer */}
        <Composer value={composerVal} onChange={setComposerVal} onSubmit={onSubmit}
          placeholder={composerPh} disabled={savedDone} />
      </aside>
    </>
  );
}

/* ───── icons ───── */
function PlusIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>; }
function DollarIcon() { return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2v20M17 6.5C17 4.6 14.8 3 12 3S7 4.6 7 6.5 9.2 10 12 10s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.6-5-3.5" /></svg>; }

Object.assign(window, { QAScreen });

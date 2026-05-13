import { useEffect, useRef, useState } from "react";
import "../../styles/drawer.css";
import "./qa.css";
import type { Draft, TicketSpec } from "../../api/qa";

const FIRST_AI_MESSAGE = "這張 ticket 大概是哪一類?";
const FIRST_AI_OPTIONS = ["列出這個專案問題"];

export function QADrawer({
  pipelineName,
  draft,
  busy,
  error,
  onSendTurn,
  onFinalize,
  onCancel,
  onClose,
}: {
  pipelineName: string;
  draft: Draft | null;
  busy: boolean;
  error: string | null;
  onSendTurn: (userMessage: string) => void;
  onFinalize: (edits?: Partial<TicketSpec>, splitInto?: TicketSpec[]) => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const transcriptRef = useRef<HTMLDivElement>(null);

  // View override:user 顯式選擇要看哪個視圖,蓋過 draft.complete 自動切的邏輯。
  // - "chat" :user 在 SpecReview 點「繼續討論」,即使 draft.complete=true 也回 chat
  // - "review":user 在 chat 點「回最終預覽」,即使 draft.complete=false 也跳預覽(spec 仍須 5/5)
  // - null :跟 draft.complete 自動切
  // 切 draft(draftId 變)清掉
  const [viewOverride, setViewOverride] = useState<"chat" | "review" | null>(null);
  useEffect(() => {
    setViewOverride(null);
  }, [draft?.draftId]);
  const specComplete = isSpecComplete(draft?.spec ?? null);
  // 最終 review 視圖條件:spec 5/5 齊,且(override="review" 或 draft.complete=true 且未 override="chat")
  const showReview =
    specComplete &&
    (viewOverride === "review" || (draft?.complete === true && viewOverride !== "chat"));

  // turns 增加 / 切回 chat 視圖時自動 scroll 到底。
  // showReview=true 期間 transcriptRef 沒掛(SpecReview 渲染);切回 chat 後新 ref 掛上才 scroll
  // biome-ignore lint/correctness/useExhaustiveDependencies: turns.length / showReview 是觸發訊號
  useEffect(() => {
    if (showReview) return;
    // 等 React commit 把 chat DOM 掛上去 + 內容 layout 完
    const id = requestAnimationFrame(() => {
      transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
    });
    return () => cancelAnimationFrame(id);
  }, [draft?.turns.length, showReview]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-stage qadr-stage">
      <button
        type="button"
        className="drawer-scrim"
        onClick={onClose}
        aria-label="關閉"
      />
      <div className="drawer qadr-drawer">
        <div className="drawer-head">
          <div className="drawer-crumb">
            <span className="mono">{pipelineName}</span>
            <span className="sep">/</span>
            <span>新 ticket</span>
            <span className="drawer-crumb-spacer" />
            <button type="button"
              className="create-x"
              onClick={onClose}
              title="關閉 (Esc) — draft 保留"
              aria-label="關閉"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="drawer-titlerow">
            <div className="drawer-title">
              {draft?.spec?.title || (draft ? "收斂中…" : "新 ticket")}
            </div>
          </div>
          <div className="drawer-meta mono">
            <span>{draft ? `${draft.turns.length} 輪對話` : "啟動中…"}</span>
            {draft && (
              <>
                <span className="sep">·</span>
                <span style={{ opacity: 0.55 }} title={`draftId: ${draft.draftId}`}>
                  draft #{draft.draftId.slice(0, 6)}
                </span>
              </>
            )}
          </div>
          <SpecChecklist spec={draft?.spec ?? null} />
        </div>

        {showReview ? (
          <div className="drawer-body qadr-body qadr-spec-body">
            <SpecReview
              spec={draft!.spec as TicketSpec}
              splitInto={draft?.splitInto}
              busy={busy}
              onCancel={onCancel}
              onFinalize={onFinalize}
              onResumeChat={() => setViewOverride("chat")}
            />
          </div>
        ) : (
          <>
            {/* spec 5/5 齊但 user 在 chat(被 override 或 backend complete=false)→ 顯示「回最終預覽」橫條 */}
            {specComplete && !showReview && (
              <div className="qadr-spec-ready-bar">
                <span>spec 已備齊,聊完想送出時:</span>
                <button
                  type="button"
                  className="btn qadr-spec-ready-bar-btn"
                  onClick={() => setViewOverride("review")}
                  disabled={busy}
                >
                  → 回最終預覽
                </button>
              </div>
            )}
            <div className="drawer-body qadr-body" ref={transcriptRef}>
              {!draft && busy && (
                <div className="qadr-loading mono">
                  <span>啟動 QA session</span>
                  <ThinkingDots />
                </div>
              )}
              {!draft && error && <div className="qadr-error">{error}</div>}
              {draft && (() => {
                const lastTurn = draft.turns[draft.turns.length - 1];
                // last 是 user → AI 還在跑(或 user 中途關 drawer 再回來,backend 仍 pending),
                // 顯思考中。useQA 會 poll 把 AI 回覆寫回 state.draft
                const waitingForAI = lastTurn?.role === "user";
                const showThinking = busy || waitingForAI;
                return (
                  <>
                    <Bubble kind="ai" message={FIRST_AI_MESSAGE} />
                    {draft.turns.map((t) => (
                      <Bubble key={t.ts + ":" + t.role} kind={t.role} message={t.message} />
                    ))}
                    {showThinking && (
                      <div className="qadr-loading mono">
                        <span>AI 思考中</span>
                        <ThinkingDots />
                      </div>
                    )}
                    {error && <div className="qadr-error">{error}</div>}
                  </>
                );
              })()}
            </div>
            <div className="drawer-foot qadr-foot">
              {/* spec 進度提示:防 AI 嘴砲「可以建 ticket」但實際還沒齊讓 user 困惑 */}
              {draft?.spec && (() => {
                const missing = FIELD_LABELS.filter((f) => {
                  const v = draft.spec?.[f.key];
                  if (v == null || v === "") return true;
                  if (Array.isArray(v) && v.length === 0) return true;
                  if (f.key === "mode") return v !== "step" && v !== "iter";
                  return false;
                });
                if (missing.length === 0) return null;
                const filled = FIELD_LABELS.length - missing.length;
                return (
                  <div className="qadr-progress mono">
                    <span>spec {filled}/{FIELD_LABELS.length} · 還差</span>
                    {missing.map((m) => (
                      <span key={m.key} className="qadr-progress-missing">
                        {m.label}
                      </span>
                    ))}
                  </div>
                );
              })()}
              {(() => {
                const last = lastAiOptions(draft);
                return (
                  <Composer
                    options={last.options}
                    optionsMode={last.mode}
                    busy={busy}
                    onSend={(msg) => {
                      // 不要在送訊息時清 forceChat — 那會在 backend 還沒處理完前讓 SpecReview
                      // 用 disk 上 stale 的 complete=true 又跳出來。
                      // user 想離開 chat 回最終預覽走專屬按鈕(SpecComplete 時顯出)。
                      onSendTurn(msg);
                    }}
                    onCancel={onCancel}
                  />
                );
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function isSpecComplete(s: Partial<TicketSpec> | null): boolean {
  if (!s) return false;
  return (
    !!s.title &&
    !!s.goal &&
    Array.isArray(s.acceptance) &&
    s.acceptance.length > 0 &&
    !!s.prompt &&
    (s.mode === "step" || s.mode === "iter")
  );
}

const FIELD_LABELS: { key: keyof TicketSpec; label: string }[] = [
  { key: "title", label: "標題" },
  { key: "goal", label: "目標" },
  { key: "acceptance", label: "驗收" },
  { key: "prompt", label: "提示詞" },
  { key: "mode", label: "模式" },
];

function SpecChecklist({ spec }: { spec: Partial<TicketSpec> | null }) {
  const [expanded, setExpanded] = useState<keyof TicketSpec | null>(null);
  const filled = (key: keyof TicketSpec) => {
    if (!spec) return false;
    const v = spec[key];
    if (v == null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    if (key === "mode") return v === "step" || v === "iter";
    return true;
  };
  const doneCount = FIELD_LABELS.filter((f) => filled(f.key)).length;
  const expandedField = expanded ? FIELD_LABELS.find((f) => f.key === expanded) : null;
  const expandedValue = expanded && spec ? spec[expanded] : undefined;

  function toggle(key: keyof TicketSpec) {
    setExpanded((cur) => (cur === key ? null : key));
  }

  return (
    <div className="qadr-checklist">
      <div className="qadr-checklist-row">
        {FIELD_LABELS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={
              "qadr-chip" +
              (filled(f.key) ? " is-filled" : "") +
              (expanded === f.key ? " is-expanded" : "")
            }
            title={f.label}
            onClick={() => toggle(f.key)}
          >
            <span className="qadr-chip-dot" />
            <span className="qadr-chip-label">{f.label}</span>
          </button>
        ))}
        <span className="qadr-checklist-count mono">
          {doneCount}/{FIELD_LABELS.length}
        </span>
      </div>
      {expandedField && (
        <div className="qadr-chip-panel">
          <div className="qadr-chip-panel-label mono">{expandedField.label}</div>
          <div className="qadr-chip-panel-value">
            {!filled(expandedField.key) ? (
              <span className="qadr-chip-panel-empty">(未填)</span>
            ) : Array.isArray(expandedValue) ? (
              <ul className="qadr-chip-panel-list">
                {expandedValue.map((v) => (
                  <li key={String(v)}>{v}</li>
                ))}
              </ul>
            ) : (
              <span>{String(expandedValue)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function lastAiOptions(
  draft: Draft | null
): { options: string[]; mode: "single" | "multi" } {
  if (!draft) return { options: [], mode: "single" };
  if (draft.turns.length === 0) return { options: FIRST_AI_OPTIONS, mode: "single" };
  const last = draft.turns[draft.turns.length - 1];
  if (last.role !== "ai") return { options: [], mode: "single" };
  return { options: last.options ?? [], mode: last.optionsMode ?? "single" };
}

function ThinkingDots() {
  return (
    <span className="qadr-thinking-dots" role="status" aria-label="loading">
      <span />
      <span />
      <span />
    </span>
  );
}

function Bubble({ kind, message }: { kind: "user" | "ai"; message: string }) {
  return (
    <div className={"qadr-bubble qadr-bubble-" + kind}>
      <div className="qadr-bubble-role mono">{kind === "user" ? "you" : "ai"}</div>
      <div className="qadr-bubble-msg">{message}</div>
    </div>
  );
}

function Composer({
  options,
  optionsMode = "single",
  busy,
  onSend,
  onCancel,
}: {
  options: string[];
  optionsMode?: "single" | "multi";
  busy: boolean;
  onSend: (msg: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const taRef = useRef<HTMLTextAreaElement>(null);

  // reset multi selection when options change (new AI turn)
  // biome-ignore lint/correctness/useExhaustiveDependencies: options is the intentional trigger; setPicked is stable
  useEffect(() => {
    setPicked(new Set());
  }, [options]);

  function send(value: string) {
    const v = value.trim();
    if (!v || busy) return;
    onSend(v);
    setText("");
    // 送出後重置 textarea 高度(setText 後 onChange 不會 fire,要手動)
    if (taRef.current) taRef.current.style.height = "auto";
  }

  function toggleMulti(i: number) {
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function sendMulti() {
    if (busy || picked.size === 0) return;
    const chosen = Array.from(picked)
      .sort((a, b) => a - b)
      .map((i) => options[i]);
    onSend(chosen.join("、"));
    setPicked(new Set());
  }

  return (
    <div className="qadr-composer">
      {options.length > 0 && optionsMode === "single" && (
        <div className="qadr-options">
          {options.map((o) => (
            <button type="button"
              key={o}
              className="btn qadr-option"
              onClick={() => send(o)}
              disabled={busy}
            >
              {o}
            </button>
          ))}
        </div>
      )}
      {options.length > 0 && optionsMode === "multi" && (
        <>
          <div className="qadr-options qadr-options-multi">
            {options.map((o, i) => (
              <button
                key={o}
                type="button"
                className={
                  "btn qadr-option qadr-option-multi" + (picked.has(i) ? " is-picked" : "")
                }
                onClick={() => toggleMulti(i)}
                disabled={busy}
              >
                <span className="qadr-option-check" aria-hidden>
                  {picked.has(i) ? "✓" : ""}
                </span>
                <span>{o}</span>
              </button>
            ))}
          </div>
          <button
            className="btn btn-primary qadr-multi-send"
            onClick={sendMulti}
            disabled={busy || picked.size === 0}
            type="button"
          >
            送出已選 ({picked.size})
          </button>
        </>
      )}
      <div className="qadr-composer-row">
        <textarea
          ref={taRef}
          className="qadr-input qadr-input-multiline"
          value={text}
          placeholder="或自己打一句…"
          rows={1}
          onChange={(e) => {
            setText(e.target.value);
            // auto-grow:resize 到內容高度,max 8 行(超過 scroll)
            const ta = e.target;
            ta.style.height = "auto";
            const max = parseFloat(getComputedStyle(ta).lineHeight) * 8;
            ta.style.height = Math.min(ta.scrollHeight, max) + "px";
          }}
          onKeyDown={(e) => {
            // Enter 送出,Shift+Enter 換行
            if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              send(text);
            }
          }}
          disabled={busy}
        />
        <button type="button"
          className="qadr-send"
          onClick={() => send(text)}
          disabled={busy || !text.trim()}
          title="送出 (Enter)"
          aria-label="送出"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="qadr-composer-hint mono">
        Enter 送出 · Shift+Enter 換行
      </div>
      <button
        className="qadr-cancel-link"
        onClick={onCancel}
        disabled={busy}
        type="button"
      >
        取消 draft
      </button>
    </div>
  );
}

function SpecReview({
  spec,
  splitInto,
  busy,
  onCancel,
  onFinalize,
  onResumeChat,
}: {
  spec: TicketSpec;
  splitInto?: TicketSpec[];
  busy: boolean;
  onCancel: () => void;
  onFinalize: (edits?: Partial<TicketSpec>, splitInto?: TicketSpec[]) => void;
  // user 想退回 chat 跟 AI 再聊聊(改主意 / 補細節)。frontend 端 force 切視圖,
  // 不送 backend(下個 turn 自然會更新 spec/complete)
  onResumeChat?: () => void;
}) {
  const [edited, setEdited] = useState<TicketSpec>(spec);
  // 預設「拆」(若 AI 提案了);user 可 toggle 改成保留 1 張
  const hasSplit = Array.isArray(splitInto) && splitInto.length >= 2;
  const [useSplit, setUseSplit] = useState<boolean>(hasSplit);

  return (
    <div className="qadr-spec">
      <div className="qadr-spec-head mono">最終預覽 — 微調後送出建立 ticket。</div>
      {hasSplit && (
        <div className="qadr-split-proposal">
          <div className="qadr-split-title mono">
            <strong>AI 評估這 ticket 範圍橫跨 {splitInto!.length} 件獨立工作</strong>
          </div>
          <ol className="qadr-split-list">
            {splitInto!.map((s, i) => (
              <li key={i}>
                <span className="qadr-split-num mono">#{i + 1}</span>
                <span>{s.title}</span>
                <span className={"chip ticket-mode qadr-split-mode-chip" + (s.mode === "iter" ? " is-iter" : "")}>
                  {s.mode === "iter" ? "迭代" : "單次"}
                </span>
              </li>
            ))}
          </ol>
          <div className="qadr-split-toggle">
            <label className="qadr-split-toggle-label">
              <input
                type="checkbox"
                checked={useSplit}
                onChange={(e) => setUseSplit(e.target.checked)}
              />
              送出時拆成 {splitInto!.length} 張獨立 ticket(取消勾選 = 合 1 張下方 spec)
            </label>
          </div>
        </div>
      )}
      <Field label="標題">
        <input
          className="qadr-input"
          value={edited.title}
          onChange={(e) => setEdited({ ...edited, title: e.target.value })}
        />
      </Field>
      <Field label="目標">
        <textarea
          className="qadr-input qadr-textarea"
          rows={3}
          value={edited.goal}
          onChange={(e) => setEdited({ ...edited, goal: e.target.value })}
        />
      </Field>
      <Field label="驗收">
        <textarea
          className="qadr-input qadr-textarea"
          rows={Math.max(4, edited.acceptance.length + 1)}
          value={edited.acceptance.join("\n")}
          onChange={(e) =>
            setEdited({ ...edited, acceptance: e.target.value.split("\n").filter(Boolean) })
          }
        />
      </Field>
      <Field label="提示詞">
        <textarea
          className="qadr-input qadr-textarea"
          rows={10}
          value={edited.prompt}
          onChange={(e) => setEdited({ ...edited, prompt: e.target.value })}
        />
      </Field>
      <Field label="模式">
        <div className="qadr-choice-row">
          <label className="qadr-radio-label">
            <input
              type="radio"
              checked={edited.mode === "iter"}
              onChange={() => setEdited({ ...edited, mode: "iter" })}
            />
            迭代任務 (iter)
          </label>
          <label className="qadr-radio-label">
            <input
              type="radio"
              checked={edited.mode === "step"}
              onChange={() => setEdited({ ...edited, mode: "step" })}
            />
            單次任務 (step)
          </label>
        </div>
      </Field>
      {edited.mode === "iter" && (
        <>
          <Field label="iter 上限輪數">
            <input
              className="qadr-input"
              type="number"
              min={1}
              max={5}
              value={edited.iterLimit ?? 5}
              onChange={(e) => {
                const v = Math.max(1, Math.min(5, Number(e.target.value) || 5));
                setEdited({ ...edited, iterLimit: v });
              }}
              style={{ width: 80 }}
            />
          </Field>
          <Field label="達上限後">
            <div className="qadr-choice-row">
              <label className="qadr-radio-label">
                <input
                  type="radio"
                  checked={(edited.iterStopAtLimit ?? true) === true}
                  onChange={() => setEdited({ ...edited, iterStopAtLimit: true })}
                />
                整條 pipeline 暫停 (建議)
              </label>
              <label className="qadr-radio-label">
                <input
                  type="radio"
                  checked={(edited.iterStopAtLimit ?? true) === false}
                  onChange={() => setEdited({ ...edited, iterStopAtLimit: false })}
                />
                標 failed,跳下一張
              </label>
            </div>
          </Field>
        </>
      )}
      <div className="qadr-spec-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          取消 draft
        </button>
        {onResumeChat && (
          <button
            type="button"
            className="btn"
            onClick={onResumeChat}
            disabled={busy}
            title="退回對話跟 AI 補充 / 修正細節,送出新訊息後 AI 會再整理 spec"
          >
            ← 繼續討論
          </button>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={() => onFinalize(edited, useSplit ? splitInto : undefined)} disabled={busy}>
          {busy ? (
            <>
              <span className="qadr-thinking-dots">
                <span /><span /><span />
              </span>{" "}
              送出中…
            </>
          ) : useSplit && hasSplit ? (
            `送出建立 ${splitInto!.length} 張 ticket`
          ) : (
            "送出建立 ticket"
          )}
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="qadr-field">
      <div className="qadr-field-label mono">{label}</div>
      {children}
    </div>
  );
}

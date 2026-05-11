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
  // turns 增加時自動 scroll 到底,turns.length 是觸發訊號(effect 內讀 ref 不算 dep)
  // biome-ignore lint/correctness/useExhaustiveDependencies: turns.length is the intentional trigger
  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [draft?.turns.length]);

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

        {draft?.complete && isSpecComplete(draft?.spec ?? null) ? (
          <div className="drawer-body qadr-body qadr-spec-body">
            <SpecReview
              spec={draft!.spec as TicketSpec}
              splitInto={draft?.splitInto}
              busy={busy}
              onCancel={onCancel}
              onFinalize={onFinalize}
            />
          </div>
        ) : (
          <>
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
                    onSend={onSendTurn}
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
  { key: "prompt", label: "prompt" },
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
        <input
          className="qadr-input"
          type="text"
          value={text}
          placeholder="或自己打一句…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
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
}: {
  spec: TicketSpec;
  splitInto?: TicketSpec[];
  busy: boolean;
  onCancel: () => void;
  onFinalize: (edits?: Partial<TicketSpec>, splitInto?: TicketSpec[]) => void;
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
                <span className={"chip ticket-mode" + (s.mode === "iter" ? " is-iter" : "")} style={{ marginLeft: 6, fontSize: 10 }}>
                  {s.mode === "iter" ? "迭代" : "單次"}
                </span>
              </li>
            ))}
          </ol>
          <div className="qadr-split-toggle">
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12 }}>
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
      <Field label="title">
        <input
          className="qadr-input"
          value={edited.title}
          onChange={(e) => setEdited({ ...edited, title: e.target.value })}
        />
      </Field>
      <Field label="goal">
        <textarea
          className="qadr-input qadr-textarea"
          rows={3}
          value={edited.goal}
          onChange={(e) => setEdited({ ...edited, goal: e.target.value })}
        />
      </Field>
      <Field label="acceptance">
        <textarea
          className="qadr-input qadr-textarea"
          rows={Math.max(4, edited.acceptance.length + 1)}
          value={edited.acceptance.join("\n")}
          onChange={(e) =>
            setEdited({ ...edited, acceptance: e.target.value.split("\n").filter(Boolean) })
          }
        />
      </Field>
      <Field label="prompt">
        <textarea
          className="qadr-input qadr-textarea"
          rows={10}
          value={edited.prompt}
          onChange={(e) => setEdited({ ...edited, prompt: e.target.value })}
        />
      </Field>
      <Field label="mode">
        <div className="qadr-choice-row" style={{ display: "flex", gap: 16, fontSize: 13 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="radio"
              checked={edited.mode === "iter"}
              onChange={() => setEdited({ ...edited, mode: "iter" })}
            />
            迭代任務 (iter)
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
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
            <div className="qadr-choice-row" style={{ display: "flex", gap: 16, fontSize: 13 }}>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <input
                  type="radio"
                  checked={(edited.iterStopAtLimit ?? true) === true}
                  onChange={() => setEdited({ ...edited, iterStopAtLimit: true })}
                />
                整條 pipeline 暫停 (建議)
              </label>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
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
        <span style={{ flex: 1 }} />
        <button type="button" className="btn btn-primary" onClick={() => onFinalize(edited, useSplit ? splitInto : undefined)} disabled={busy}>
          {busy ? (
            <>
              <span className="qadr-thinking-dots" style={{ display: "inline-flex", verticalAlign: "middle" }}>
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

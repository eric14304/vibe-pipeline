import { useEffect, useMemo, useRef, useState } from "react";
import { PickerSelect } from "../../ui/PickerSelect";

const FALLBACK_BRANCHES = ["main"];

export function CreateCard({
  onCancel,
  onSubmit,
  existingNames = [],
  branches,
  defaultAutoMerge = false,
}: {
  onCancel: () => void;
  onSubmit: (data: { name: string; baseBranch: string; autoMerge: boolean }) => void;
  existingNames?: string[];
  branches?: string[];
  defaultAutoMerge?: boolean;
}) {
  const baseList = useMemo(
    () => (branches && branches.length > 0 ? branches : FALLBACK_BRANCHES),
    [branches]
  );
  const defaultBase = baseList.includes("main")
    ? "main"
    : baseList.includes("master")
    ? "master"
    : baseList[0];
  const [name, setName] = useState("");
  const [baseBranch, setBaseBranch] = useState(defaultBase);
  const [baseOpen, setBaseOpen] = useState(false);
  const [autoMerge, setAutoMerge] = useState(defaultAutoMerge);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLFormElement>(null);

  const trimmed = name.trim();
  const taken = existingNames.includes(trimmed);
  const formatOk = /^[a-z0-9][a-z0-9-_]*$/.test(trimmed);
  const valid = trimmed.length > 0 && !taken && formatOk;
  const showFormatHint = trimmed.length > 0 && !formatOk;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    onSubmit({ name: trimmed, baseBranch, autoMerge });
  }

  return (
    <form className="create-card fade-up" onSubmit={submit} ref={cardRef}>
      <div className="create-card-head">
        <span className="rail-state-dot" style={{ background: "var(--draft)" }} />
        <span className="create-card-eyebrow mono">新 pipeline</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="create-x" onClick={onCancel} title="取消 (Esc)" aria-label="取消">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <label className={"create-input" + (taken || showFormatHint ? " is-error" : "")}>
        <input
          ref={inputRef}
          className="mono"
          type="text"
          value={name}
          placeholder="pipeline 名稱"
          onChange={(e) => setName(e.target.value)}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="create-input-hint mono">{taken ? "已存在" : "Tab ▶"}</span>
      </label>
      {taken && <div className="create-error mono">名稱已存在,改一個。</div>}
      {showFormatHint && !taken && (
        <div className="create-error mono">只能用 a-z / 0-9 / - / _,首字需英數。</div>
      )}

      <div className="create-field">
        <div className="create-field-label">基底分支</div>
        <PickerSelect
          open={baseOpen}
          setOpen={setBaseOpen}
          value={baseBranch}
          onChange={setBaseBranch}
          icon={<span className="mono" style={{ color: "var(--fg-mute)" }}>⎇</span>}
          options={baseList.map((b) => ({ id: b, label: b, mono: true }))}
        />
      </div>

      <label
        className={"toggle-pill mono" + (autoMerge ? " is-on" : "")}
        title="全 ticket done → backend 自動 append merge ticket 走 runner 流程,不用人按"
      >
        <input
          type="checkbox"
          checked={autoMerge}
          onChange={(e) => setAutoMerge(e.target.checked)}
        />
        <span className="toggle-pill-track" aria-hidden>
          <span className="toggle-pill-thumb" />
        </span>
        ready 後自動合併
      </label>

      <div className="create-actions">
        <button type="button" className="btn create-cancel" onClick={onCancel}>
          <span>Esc</span>
          <span style={{ color: "var(--fg-faint)" }}>取消</span>
        </button>
        <button type="submit" className="btn btn-primary create-submit" disabled={!valid}>
          <span>建立</span>
          <span className="kbd-inline mono">↵</span>
        </button>
      </div>
    </form>
  );
}

export function CreatePlaceholder() {
  return (
    <main className="focus focus-create-empty">
      <div className="create-empty fade-up">
        <div className="create-empty-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7 L9 12 L4 17" />
            <path d="M10 7 L15 12 L10 17" opacity="0.55" />
            <circle cx="19" cy="12" r="1.6" fill="currentColor" />
          </svg>
        </div>
        <div className="create-empty-title">新 pipeline 還沒建立</div>
        <div className="create-empty-desc">
          填好左側資訊 → 按 <span className="kbd mono">↵</span> → 自動切過去,立刻可以開第一張 ticket。
        </div>
      </div>
    </main>
  );
}

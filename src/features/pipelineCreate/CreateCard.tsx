import { useEffect, useRef, useState } from "react";
import { PickerSelect } from "../../ui/PickerSelect";

const BASE_BRANCHES = ["main", "develop", "release/2.4"];
const MERGE_STRATEGIES = [
  { id: "squash", label: "squash", hint: "預設" },
  { id: "merge", label: "merge", hint: "保留 commits" },
  { id: "rebase", label: "rebase", hint: "線性歷史" },
];

export function CreateCard({
  onCancel,
  onSubmit,
  existingNames = [],
}: {
  onCancel: () => void;
  onSubmit: (data: { name: string; baseBranch: string; mergeStrategy: string }) => void;
  existingNames?: string[];
}) {
  const [stem, setStem] = useState("billing");
  const [baseBranch, setBaseBranch] = useState("main");
  const [mergeStrategy, setMergeStrategy] = useState("squash");
  const [baseOpen, setBaseOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLFormElement>(null);

  const name = "feat-" + stem;
  const taken = existingNames.includes(name);
  const valid = stem.trim().length > 0 && !taken && /^[a-z0-9-]+$/.test(stem);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!valid) return;
    onSubmit({ name, baseBranch, mergeStrategy });
  }

  return (
    <form className="create-card fade-up" onSubmit={submit} ref={cardRef}>
      <div className="create-card-head">
        <span className="rail-state-dot" style={{ background: "var(--draft)" }} />
        <span className="create-card-eyebrow mono">new pipeline</span>
        <span style={{ flex: 1 }} />
        <button type="button" className="create-x" onClick={onCancel} title="取消 (Esc)" aria-label="取消">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <label className={"create-input" + (taken ? " is-error" : "")}>
        <span className="create-prefix mono">feat-</span>
        <input
          ref={inputRef}
          className="mono"
          type="text"
          value={stem}
          onChange={(e) => setStem(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="create-input-hint mono">{taken ? "已存在" : "Tab ▶"}</span>
      </label>
      {taken && <div className="create-error mono">名稱已存在,改一個。</div>}

      <div className="create-field">
        <div className="create-field-label mono">base_branch</div>
        <PickerSelect
          open={baseOpen}
          setOpen={setBaseOpen}
          value={baseBranch}
          onChange={setBaseBranch}
          icon={<span className="mono" style={{ color: "var(--fg-mute)" }}>⎇</span>}
          options={BASE_BRANCHES.map((b) => ({ id: b, label: b, mono: true }))}
        />
      </div>

      <div className="create-field">
        <div className="create-field-label mono">merge_strategy</div>
        <PickerSelect
          open={mergeOpen}
          setOpen={setMergeOpen}
          value={mergeStrategy}
          onChange={setMergeStrategy}
          options={MERGE_STRATEGIES.map((m) => ({ id: m.id, label: m.label, hint: m.hint }))}
        />
      </div>

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

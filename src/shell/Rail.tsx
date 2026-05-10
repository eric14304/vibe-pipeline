import { PlusIcon } from "../ui/icons";
import { STATE_COLOR } from "../data/pipelines";
import type { Pipeline } from "../types/pipeline";

export function Rail({
  pipelines,
  activeId,
  onSelect,
  creating = false,
  onStartCreate,
  createSlot,
  addLabel = "新 pipeline",
  draftPipelineIds,
}: {
  pipelines: Pipeline[];
  activeId: string;
  onSelect: (id: string) => void;
  creating?: boolean;
  onStartCreate?: () => void;
  createSlot?: React.ReactNode;
  addLabel?: string;
  draftPipelineIds?: Set<string>;
}) {
  return (
    <aside className={"rail" + (creating ? " is-creating" : "")}>
      <div className="rail-section-label mono">PIPELINES</div>
      <div className="rail-list">
        {creating ? (
          createSlot
        ) : (
          <button className="rail-add" onClick={onStartCreate}>
            <PlusIcon /> <span>{addLabel}</span>
          </button>
        )}

        {pipelines.map((p) => (
          <RailItem
            key={p.id}
            p={p}
            active={p.id === activeId}
            onClick={() => onSelect(p.id)}
            muted={creating}
            hasDraft={draftPipelineIds?.has(p.id) ?? false}
          />
        ))}
      </div>
      <div className="rail-spacer" />
      {/* Archive 功能未實作,prototype 留下的假 chip 移除避免誤導 */}
    </aside>
  );
}

function RailItem({ p, active, onClick, muted, hasDraft }: { p: Pipeline; active: boolean; onClick: () => void; muted?: boolean; hasDraft?: boolean }) {
  const done = p.tickets.filter((t) => t.status === "done").length;
  const total = p.tickets.length;
  return (
    <button className={"rail-item" + (active ? " is-active" : "") + (muted ? " is-muted" : "")} onClick={onClick}>
      <div className="rail-item-row">
        <span className="rail-state-dot" style={{ background: STATE_COLOR[p.state] }} />
        <span className="rail-item-name">{p.name}</span>
        {hasDraft && (
          <span
            className="mono"
            title="進行中 QA"
            style={{
              fontSize: 9,
              padding: "1px 5px",
              borderRadius: 3,
              background: "var(--accent-soft)",
              color: "var(--accent)",
              letterSpacing: "0.04em",
            }}
          >
            QA
          </span>
        )}
        <span className="rail-item-count mono">
          {done}/{total}
        </span>
      </div>
      <div className="rail-mini">
        {p.tickets.map((t, i) => {
          const fill =
            t.status === "done"
              ? "var(--done)"
              : t.status === "running"
              ? "var(--running)"
              : t.status === "paused"
              ? "var(--paused)"
              : t.status === "failed" ||
                t.status === "failed_iter_limit" ||
                t.status === "failed_transient"
              ? "var(--failed)"
              : t.status === "ready"
              ? "var(--running-soft)"
              : "var(--line-2)";
          return <span key={i} className={"rail-mini-cell" + (t.status === "running" ? " is-running" : "")} style={{ background: fill }} />;
        })}
      </div>
      <div className="rail-item-meta">
        <span className="mono">⎇ {p.branch.replace("pipeline/", "")}</span>
      </div>
    </button>
  );
}

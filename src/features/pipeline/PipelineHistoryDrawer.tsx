import { useEffect } from "react";
import { createPortal } from "react-dom";
import "../../styles/drawer.css";
import "./ticketDrawer.css";
import { RunHistory } from "./RunHistory";

// Pipeline-level 執行紀錄 drawer。從 pipeline header OverflowMenu 開,
// 顯示該 pipeline 跑過的所有 runner spawn(cost / duration / result / token)。
// 跟 TicketDrawer 用同一套 .drawer-stage / .drawer 樣式;portal 到 body 避免 stacking context 雷
export function PipelineHistoryDrawer({
  pipelineName,
  pipelineBranch,
  pipelineId,
  projectHash,
  onClose,
}: {
  pipelineName: string;
  pipelineBranch: string;
  pipelineId: string;
  projectHash: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="drawer-stage tdrw-stage">
      <button
        type="button"
        className="drawer-scrim"
        onClick={onClose}
        aria-label="關閉"
      />
      <div className="drawer tdrw-drawer">
        <div className="drawer-head">
          <div className="drawer-crumb">
            <span className="mono">{pipelineName}</span>
            <span className="sep">/</span>
            <span className="mono" style={{ color: "var(--fg-mute)" }}>
              ⎇ {pipelineBranch}
            </span>
            <span className="drawer-crumb-spacer" />
            <button
              type="button"
              className="create-x"
              onClick={onClose}
              title="關閉 (Esc)"
              aria-label="關閉"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <div className="drawer-titlerow">
            <div className="drawer-title">執行紀錄</div>
          </div>
          <div className="drawer-meta mono" style={{ color: "var(--fg-mute)" }}>
            pipeline 跑過的所有 runner spawn(主 agent session log)
          </div>
        </div>
        <div className="drawer-body">
          <RunHistory projectHash={projectHash} pipelineId={pipelineId} />
        </div>
      </div>
    </div>,
    document.body
  );
}

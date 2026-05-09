import { useState } from "react";
import { FolderQuestionIcon, RefreshIcon, SpinnerIcon } from "../../ui/icons";
import * as api from "../../api/projects";
import type { Project } from "../../../shared/types";
import "../../styles/init.css";

export function InitPopup({
  project,
  onInitialized,
  onDismiss,
}: {
  project: Project;
  onInitialized: (next: Project) => void;
  onDismiss: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function autoInit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api.init(project.hash);
      onInitialized(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="init-popup-overlay" role="dialog" aria-modal="true">
      <div className="init-card fade-up">
        <div className="init-scan">
          <div className="init-scan-icon">
            <FolderQuestionIcon />
          </div>
          <div className="init-scan-text mono">
            <div className="init-scan-status">
              <span style={{ opacity: 0.65 }}>this repo isn't set up yet</span>
            </div>
            <div className="init-scan-path">{project.path}</div>
            <div className="init-scan-miss">
              <span style={{ color: "var(--accent)" }}>✕</span>{" "}
              no <code className="init-inline-code">.tickets/</code> found
            </div>
          </div>
        </div>

        <div className="init-body">
          <h1 className="init-title">Initialize this project?</h1>
          <p className="init-desc">
            vibe-pipeline 將在 <code className="init-inline-code">{project.name}</code> 建立 <code className="init-inline-code">.tickets/</code> 結構,
            包含 <code className="init-inline-code">config.yaml</code>、<code className="init-inline-code">tickets/</code>、<code className="init-inline-code">pipelines/</code>、<code className="init-inline-code">skills/</code>,
            並把 <code className="init-inline-code">.tickets/.runtime/</code> 寫入 <code className="init-inline-code">.gitignore</code>。
          </p>
        </div>

        <div className="init-tree-wrap">
          <div className="init-section-label mono">It'll create</div>
          <div className="init-tree mono">
            <div>
              <span className="init-tree-glyph">▸</span> .tickets/
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">├──</span>
              <span className="init-tree-name">config.yaml</span>
              <span className="init-tree-cmt">project-level 設定</span>
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">├──</span>
              <span className="init-tree-name">tickets/</span>
              <span className="init-tree-cmt">ticket 定義 (YAML)</span>
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">├──</span>
              <span className="init-tree-name">pipelines/</span>
              <span className="init-tree-cmt">pipeline 定義 (YAML)</span>
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">└──</span>
              <span className="init-tree-name">skills/</span>
              <span className="init-tree-cmt">SKILL.md 與候選</span>
            </div>
          </div>
        </div>

        {error && <div className="init-popup-error">{error}</div>}

        <div className="init-foot">
          <span className="init-foot-q">已經自己跑過 init?</span>
          <button className="btn" onClick={onDismiss} disabled={busy}>
            稍後
          </button>
          <span className="init-foot-spacer" />
          <div className="init-popup-actions">
            <button className="btn btn-primary" onClick={autoInit} disabled={busy}>
              {busy ? (
                <>
                  <SpinnerIcon /> 建立中…
                </>
              ) : (
                <>
                  <RefreshIcon /> 自動初始化
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

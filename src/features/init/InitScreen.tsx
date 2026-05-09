import { useEffect, useState } from "react";
import { Logo } from "../../ui/Logo";
import {
  BookIcon,
  CheckIcon,
  CopyIcon,
  FolderQuestionIcon,
  RefreshIcon,
  SpinnerIcon,
} from "../../ui/icons";
import "../../styles/init.css";

export function InitScreen({ onReady }: { onReady?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scanLine, setScanLine] = useState("scanning…");
  const cmd = "cd ~/code/your-repo && tt init";

  useEffect(() => {
    if (refreshing) return;
    const phrases = ["scanning…", "checking .git", "looking for .vibe-pipeline/"];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % phrases.length;
      setScanLine(phrases[i]);
    }, 1800);
    return () => clearInterval(id);
  }, [refreshing]);

  function copy() {
    navigator.clipboard?.writeText(cmd).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setTimeout(() => onReady?.(), 1100);
  }

  return (
    <div className="init-root dotgrid">
      <div className="init-brand">
        <Logo size={22} />
        <span className="init-brand-name">vibe-pipeline</span>
      </div>

      <div className="init-card fade-up">
        <div className="init-scan">
          <div className="init-scan-icon">
            <FolderQuestionIcon />
          </div>
          <div className="init-scan-text mono">
            <div className="init-scan-status">
              <span className={refreshing ? "spin" : ""} style={{ display: "inline-block", width: 10, height: 10 }}>
                {refreshing ? <SpinnerIcon /> : <span style={{ opacity: 0.6 }}>·</span>}
              </span>
              <span style={{ opacity: 0.65 }}>{refreshing ? "rechecking…" : scanLine}</span>
            </div>
            <div className="init-scan-path">~/code/your-repo</div>
            <div className="init-scan-miss">
              <span style={{ color: "var(--accent)" }}>✕</span>{" "}
              no <code className="init-inline-code">.vibe-pipeline/</code> found
            </div>
          </div>
        </div>

        <div className="init-body">
          <h1 className="init-title">This repo isn't set up yet.</h1>
          <p className="init-desc">
            vibe-pipeline 在這個 repo 裡找不到 <code className="init-inline-code">.vibe-pipeline/</code> 資料夾。
            到專案底下跑一次 <code className="init-inline-code">tt init</code>,它會建立資料夾、寫入預設的 SKILL.md,然後就可以開始建 pipeline 了。
          </p>
        </div>

        <div className="init-cmd-wrap">
          <div className="init-section-label mono">Run this in your terminal</div>
          <div className="init-cmd">
            <span className="init-cmd-prompt mono">$</span>
            <span className="init-cmd-text mono">
              cd ~/code/your-repo &amp;&amp; <span style={{ color: "var(--accent)", fontWeight: 600 }}>tt init</span>
            </span>
            <button className={"init-cmd-copy" + (copied ? " is-copied" : "")} onClick={copy}>
              {copied ? (
                <>
                  <CheckIcon /> copied
                </>
              ) : (
                <>
                  <CopyIcon /> copy
                </>
              )}
            </button>
          </div>
        </div>

        <div className="init-tree-wrap">
          <div className="init-section-label mono">It'll create</div>
          <div className="init-tree mono">
            <div>
              <span className="init-tree-glyph">▸</span> .vibe-pipeline/
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">├──</span>
              <span className="init-tree-name">SKILL.md</span>
              <span className="init-tree-cmt">預設 doer / critic 規則</span>
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">├──</span>
              <span className="init-tree-name">pipelines/</span>
              <span className="init-tree-cmt">ticket 資料</span>
            </div>
            <div className="init-tree-row">
              <span className="init-tree-line">└──</span>
              <span className="init-tree-name">config.yml</span>
              <span className="init-tree-cmt">預算、模型、權限</span>
            </div>
          </div>
        </div>

        <div className="init-foot">
          <span className="init-foot-q">Already ran it?</span>
          <button className="btn btn-primary" onClick={refresh} disabled={refreshing}>
            {refreshing ? (
              <>
                <SpinnerIcon /> rechecking…
              </>
            ) : (
              <>
                <RefreshIcon /> Refresh
              </>
            )}
          </button>
          <span className="init-foot-spacer" />
          <a className="init-foot-link mono" href="#" onClick={(e) => e.preventDefault()}>
            <BookIcon /> docs / setup <span style={{ opacity: 0.7 }}>↗</span>
          </a>
        </div>
      </div>

      <div className="init-hint mono">
        所有看板與設定都被隱藏,直到偵測到 <code className="init-inline-code" style={{ fontSize: 10 }}>.vibe-pipeline/</code>
      </div>
    </div>
  );
}

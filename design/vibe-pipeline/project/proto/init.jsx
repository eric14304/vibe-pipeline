// Init screen — repo without .tickets/
// Centered card prompts user to run `tt init`. Refresh button simulates check + transitions.

const { useState, useRef, useEffect } = React;

function InitScreen({ onReady }) {
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [scanLine, setScanLine] = useState("scanning…");
  const cmd = "cd ~/code/your-repo && tt init";

  // tiny scanning ticker
  useEffect(() => {
    if (refreshing) return;
    const phrases = ["scanning…", "checking .git", "looking for .tickets/"];
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
    setTimeout(() => onReady(), 1100);
  }

  return (
    <div className="init-root dotgrid">
      {/* top-left brand */}
      <div className="init-brand">
        <Logo />
        <span className="init-brand-name">vibe-pipeline</span>
      </div>

      {/* center card */}
      <div className="init-card fade-up">

        {/* scanning header */}
        <div className="init-scan">
          <div className="init-scan-icon">
            <FolderQuestionIcon />
          </div>
          <div className="init-scan-text mono">
            <div className="init-scan-status">
              <span className={refreshing ? "spin" : ""} style={{ display:"inline-block", width:10, height:10 }}>
                {refreshing ? <SpinnerIcon /> : <span style={{ opacity: 0.6 }}>·</span>}
              </span>
              <span style={{ opacity: 0.65 }}>{refreshing ? "rechecking…" : scanLine}</span>
            </div>
            <div className="init-scan-path">~/code/your-repo</div>
            <div className="init-scan-miss">
              <span style={{ color: "var(--accent)" }}>✕</span>{" "}
              no <code className="init-inline-code">.tickets/</code> found
            </div>
          </div>
        </div>

        {/* title + body */}
        <div className="init-body">
          <h1 className="init-title">This repo isn't set up yet.</h1>
          <p className="init-desc">
            vibe-pipeline 在這個 repo 裡找不到 <code className="init-inline-code">.tickets/</code> 資料夾。
            到專案底下跑一次 <code className="init-inline-code">tt init</code>,它會建立資料夾、寫入預設的 SKILL.md,然後就可以開始建 pipeline 了。
          </p>
        </div>

        {/* command */}
        <div className="init-cmd-wrap">
          <div className="init-section-label mono">Run this in your terminal</div>
          <div className="init-cmd">
            <span className="init-cmd-prompt mono">$</span>
            <span className="init-cmd-text mono">
              cd ~/code/your-repo &amp;&amp; <span style={{ color: "var(--accent)", fontWeight: 600 }}>tt init</span>
            </span>
            <button className={"init-cmd-copy" + (copied ? " is-copied" : "")} onClick={copy}>
              {copied ? <><CheckIcon /> copied</> : <><CopyIcon /> copy</>}
            </button>
          </div>
        </div>

        {/* tree preview */}
        <div className="init-tree-wrap">
          <div className="init-section-label mono">It'll create</div>
          <div className="init-tree mono">
            <div><span className="init-tree-glyph">▸</span> .tickets/</div>
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

        {/* footer */}
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

      {/* bottom hint */}
      <div className="init-hint mono">
        所有看板與設定都被隱藏,直到偵測到 <code className="init-inline-code" style={{ fontSize: 10 }}>.tickets/</code>
      </div>
    </div>
  );
}

/* ───────── icons ───────── */
function FolderQuestionIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M12 11.5a1.6 1.6 0 1 1 2.4 1.4c-.7.4-.9.7-.9 1.3" />
      <circle cx="13.5" cy="16.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CopyIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>;
}
function CheckIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 12.5 9.5 18 20 6" />
  </svg>;
}
function RefreshIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" />
    <path d="M3 21v-5h5" />
  </svg>;
}
function BookIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5a1.5 1.5 0 0 0 0 3H20" />
    <path d="M5 18V3" />
  </svg>;
}
function SpinnerIcon() {
  return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="spin">
    <path d="M12 3a9 9 0 1 1-9 9" />
  </svg>;
}
function Logo({ size = 22 }) {
  // vibe-pipeline mark: stacked chevron flow + leading iter dot.
  // 3 chevrons fading back = pipeline / progression; dot = "now / iter pulse".
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-label="vibe-pipeline">
      <path d="M4 7 L9 12 L4 17"
            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 7 L15 12 L10 17"
            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            opacity="0.55" />
      <circle cx="19" cy="12" r="2" fill="var(--accent)" />
    </svg>
  );
}

Object.assign(window, { InitScreen });

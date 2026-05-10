import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import * as api from "../../api/projects";
import "./diffModal.css";

export function DiffModal({
  projectHash,
  pipelineId,
  pipelineBranch,
  baseBranch,
  onClose,
}: {
  projectHash: string;
  pipelineId: string;
  pipelineBranch: string;
  baseBranch: string;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<api.FullDiff | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getFullDiff(projectHash, pipelineId)
      .then((d) => {
        if (!cancelled) setDiff(d);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [projectHash, pipelineId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portal:跳出 ReadyBanner 的 transform containing block(.fade-up 會困住 position:fixed)
  return createPortal(
    <div className="diff-modal-stage" role="dialog" aria-modal="true">
      <button
        type="button"
        className="diff-modal-scrim"
        onClick={onClose}
        aria-label="關閉"
      />
      <div className="diff-modal fade-up">
        <div className="diff-modal-head">
          <div className="diff-modal-title">
            <span>Diff</span>
            <span className="diff-modal-branch mono">
              {pipelineBranch} → {baseBranch}
            </span>
          </div>
          {diff && (
            <span className="diff-modal-summary mono">
              {diff.files.length} files
              {" · "}
              <span style={{ color: "var(--done)" }}>
                +{diff.files.reduce((s, f) => s + f.added, 0)}
              </span>
              {" "}
              <span style={{ color: "var(--failed)" }}>
                −{diff.files.reduce((s, f) => s + f.deleted, 0)}
              </span>
            </span>
          )}
          <button type="button" className="diff-modal-x" onClick={onClose} title="關閉 (Esc)">
            ✕
          </button>
        </div>

        {error && <div className="diff-modal-err">讀取失敗:{error}</div>}
        {!error && !diff && <div className="diff-modal-loading">載入中…</div>}
        {!error && diff && diff.files.length === 0 && (
          <div className="diff-modal-empty">沒有改動。</div>
        )}
        {!error && diff && diff.files.length > 0 && (
          <div className="diff-modal-body">
            <div className="diff-modal-files">
              {diff.files.map((f) => (
                <a
                  key={f.path}
                  href={`#diff-file-${slug(f.path)}`}
                  className="diff-modal-file-row mono"
                >
                  <span className="diff-modal-file-path">{f.path}</span>
                  <span className="diff-modal-file-stat">
                    <span style={{ color: "var(--done)" }}>+{f.added}</span>
                    <span style={{ color: "var(--failed)", marginLeft: 4 }}>−{f.deleted}</span>
                  </span>
                </a>
              ))}
            </div>
            <div className="diff-modal-content mono">
              {parseDiffByFile(diff.raw).map((block) => (
                <div
                  key={block.path}
                  id={`diff-file-${slug(block.path)}`}
                  className="diff-modal-file-block"
                >
                  <div className="diff-modal-file-header">{block.path}</div>
                  <pre className="diff-modal-pre">
                    {block.lines.map((l, i) => (
                      // append-only diff lines,內容會重複(空行 / context),index 是 stable 正確 key
                      // biome-ignore lint/suspicious/noArrayIndexKey: append-only diff lines
                      <span key={i} className={"diff-line is-" + l.kind}>
                        {l.text}
                      </span>
                    ))}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "-");
}

// 把 git diff 整段切成檔案 block,每行標 kind 給 CSS 上色。
type DiffLine = { kind: "add" | "del" | "meta" | "hunk" | "context"; text: string };
type DiffBlock = { path: string; lines: DiffLine[] };

function parseDiffByFile(raw: string): DiffBlock[] {
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const blocks: DiffBlock[] = [];
  let cur: DiffBlock | null = null;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      // "diff --git a/src/foo.ts b/src/foo.ts" → 取 b/ 後面當 path
      const m = /diff --git a\/(.+?) b\/(.+)$/.exec(line);
      const path = m ? m[2] : line.slice("diff --git ".length);
      cur = { path, lines: [{ kind: "meta", text: line + "\n" }] };
      blocks.push(cur);
      continue;
    }
    if (!cur) continue;
    let kind: DiffLine["kind"] = "context";
    if (line.startsWith("@@")) kind = "hunk";
    else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file") || line.startsWith("similarity ") || line.startsWith("rename ")) kind = "meta";
    else if (line.startsWith("+")) kind = "add";
    else if (line.startsWith("-")) kind = "del";
    cur.lines.push({ kind, text: line + "\n" });
  }
  return blocks;
}

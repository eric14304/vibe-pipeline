// CodexAdapter:把 vibe-pipeline 的 spawn API 對應到 OpenAI Codex CLI(`codex exec`)。
//
// Codex CLI 與 Claude CLI 的差異與本 adapter 的降級策略:
//
// 1. session resume:codex 有 `codex exec resume <session-id>`,但 session id 由 codex 自己產(rollout file uuid),
//    無法像 claude 那樣 caller 指定 --session-id 預先決定。本 adapter 把多輪 QA 折成「每輪重組整段 history
//    塞進 user prompt」,supportsSessionResume=false。caller 不需改,適 adapter 在 spawn 內處理。
//    註:這是 functional 降級,QA history 會佔 token,但 codex 是 alt provider,trade-off 可接受。
//
// 2. Task tool dispatch:codex 沒對應的 sub-agent 工具,supportsTaskDispatch=false。runner kind 跑起來時
//    主 agent 就是執行 agent(沒有「派 sub-agent 改 code」的層次),system prompt 內預先把「執行 / 審核」流程
//    壓平成主 agent 自駕(Bash + 內建檔案編輯)。runnerPrompt 寫法現階段是 claude-flavored;codex 跑 runner 時
//    capability 標 false 提醒上層「行為不等價」,真正要切 codex runner 需後續另寫 prompt 適配層
//    (本 ticket 不做,標 TODO)。
//
// 3. stream JSON:codex 有 `exec --json` 輸出 JSONL,可解析。但 vibe-pipeline 既有 caller 是 buffer 全量再
//    JSON.parse,本 adapter 用 `-o <tmpfile>` 把最終 assistant message 寫檔,再讀回。supportsStreamJson=false
//    意指「不對外暴露 stream 介面」。
//
// 4. tool whitelist:claude 有 --disallowedTools / --allowedTools,codex 沒等價。codex 用 sandbox mode
//    + approval policy 控制;QA / split 用 read-only sandbox,runner 用 workspace-write。
//    supportsToolWhitelist=false。
//
// Perf flag 對應(對齊 refs/claude-cli-spawn-perf-2026-05-11.md):
//   claude --setting-sources ""        → codex --ignore-user-config + --ignore-rules
//   claude --strict-mcp-config + 空 MCP → codex -c mcp_servers={}(override TOML)
//   claude --disable-slash-commands    → 無對應(codex exec 本就 non-interactive)
//   claude --no-session-persistence    → codex --ephemeral

import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  CliAdapter,
  CliCapabilities,
  QASpawnOpts,
  RunnerSpawnOpts,
  SplitSpawnOpts,
  SpawnOpts,
  SpawnedProcess,
} from "./adapter";

// codex output last-message file 在 adapter 內管理。spawn 回去後 caller 仍只看 stdout,
// 我們 wrap codex 行程,等 exit 後把 last-message file 內容 echo 到 stdout 以兼容 caller。
// 但 Bun.Subprocess.stdout 是 ReadableStream,沒辦法事後注入。
// 解法:adapter 自己組 shell script — codex exec ... -o <tmp>; cat <tmp> 1>&2 重定向?
// 太脆。改用 parseResult 從 codex `--json` JSONL stdout 取 agent_message 文本。
//
// 結論:CodexAdapter spawn 一律加 --json,parseResult 從 JSONL 掃最後一個 agent_message。

export class CodexAdapter implements CliAdapter {
  readonly name = "codex";

  readonly capabilities: CliCapabilities = {
    supportsSessionResume: false,
    supportsTaskDispatch: false,
    supportsStreamJson: false,
    supportsToolWhitelist: false,
  };

  async checkAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["codex", "--version"], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      return proc.exitCode === 0;
    } catch {
      return false;
    }
  }

  spawn(opts: SpawnOpts): SpawnedProcess {
    if (opts.kind === "qa") return spawnQA(opts);
    if (opts.kind === "runner") return spawnRunner(opts);
    if (opts.kind === "split") return spawnSplit(opts);
    throw new Error("CodexAdapter: 'merge' task class 不獨立 spawn,呼叫端應走 orchestrator.start");
  }

  parseResult(_kind: "qa" | "split" | "runner", stdout: string): string {
    // codex exec --json 輸出 JSONL:每行一個 event。掃最後一個 type=agent_message 取 .message。
    // fallback:整段當 plain text 回去(LLM 偶爾不照規矩)。
    const lines = stdout.split(/\r?\n/).filter((l) => l.trim().length > 0);
    let lastMsg: string | null = null;
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as { type?: string; msg?: { type?: string; message?: string }; message?: string };
        // codex JSONL 形狀可能是 { msg: { type: 'agent_message', message } } 或扁平 { type, message }
        const inner = ev.msg ?? ev;
        if (inner && typeof inner === "object") {
          const t = (inner as { type?: string }).type;
          const m = (inner as { message?: string }).message;
          if (t === "agent_message" && typeof m === "string") {
            lastMsg = m;
          }
        }
      } catch {
        // 非 JSON 行,忽略
      }
    }
    if (lastMsg !== null) return lastMsg;
    // fallback:回最後一段非空文字
    const tail = lines.slice(-1)[0] ?? "";
    return tail;
  }
}

// ─── 共用 args ──────────────────────────────────────────────────────

function commonExecArgs(): string[] {
  return [
    "codex",
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    "-c",
    "mcp_servers={}",
  ];
}

// 把 system prompt 折進 instructions(codex 沒對應 --system-prompt flag)。
// codex `-c` 可覆寫 instructions,但放 prompt 太長走 TOML 也不雅;改在 user prompt 前面 wrap。
function wrapPrompt(systemPrompt: string, userMessage: string): string {
  return [
    "[System instructions]",
    systemPrompt,
    "",
    "[User message]",
    userMessage,
  ].join("\n");
}

// QA 多輪降級:無 session resume,把 history 串成 user prompt。
// caller(claudeCli.runTurn)目前只給 userMessage(單輪)— 多輪 history 在 claude 用 --resume 取回,
// 換 codex 後沒接住。本 adapter 暫時用「不支援 follow-up」處理:isFirstTurn=false 拋錯,
// caller 看 capability flag 決定降級(其實 caller 用 getTaskConfig 拿 provider 後可走另一條 path,
// 但 ticket 範圍不重寫 caller,僅在 spawn 內回報能力限制)。
function spawnQA(opts: QASpawnOpts): SpawnedProcess {
  const { cwd, userMessage, isFirstTurn, systemPrompt, appendSystemPrompt, model, history } = opts;
  if (!isFirstTurn) {
    // 沒 session resume → 把 caller 提供的 history(之前已完成的輪次,不含本輪 userMessage)
    // 折成 transcript 串進 prompt;不然 codex 跨輪會失憶。
    const combined = appendSystemPrompt
      ? systemPrompt + "\n\n" + appendSystemPrompt
      : systemPrompt;
    const transcript = (history && history.length > 0)
      ? history
          .map((t) => (t.role === "user" ? "[User] " : "[Assistant] ") + t.content)
          .join("\n\n")
      : "";
    const prompt = transcript
      ? [
          "[System instructions]",
          combined,
          "",
          "[Conversation history]",
          transcript,
          "",
          "[User message]",
          userMessage,
        ].join("\n")
      : wrapPrompt(combined, userMessage);
    const args = [
      ...commonExecArgs(),
      "-C",
      cwd,
      "-s",
      "read-only",
      "-a",
      "never",
      "--ephemeral",
      "-m",
      model,
      prompt,
    ];
    return Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  }
  const args = [
    ...commonExecArgs(),
    "-C",
    cwd,
    "-s",
    "read-only",
    "-a",
    "never",
    "--ephemeral",
    "-m",
    model,
    wrapPrompt(systemPrompt, userMessage),
  ];
  return Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
}

function spawnRunner(opts: RunnerSpawnOpts): SpawnedProcess {
  const { cwd, initialMessage, systemPrompt, model } = opts;
  // runner 要改 source code:workspace-write sandbox + bypass approvals
  // (本機 vibe-pipeline 已是受控環境,sandbox + 'never' approval 等價 claude runner 的工具白名單放寬)
  // 不加 --ephemeral:跟 QA / split 不對稱是刻意 — runner 長任務跨 round / 多次 spawn,
  // 寫 rollout history 對後續除錯 / resume / 觀測有用,值得保留 disk session。
  const args = [
    ...commonExecArgs(),
    "-C",
    cwd,
    "-s",
    "workspace-write",
    "-a",
    "never",
    "-m",
    model,
    wrapPrompt(systemPrompt, initialMessage),
  ];
  return Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
}

function spawnSplit(opts: SplitSpawnOpts): SpawnedProcess {
  const { cwd, systemPrompt, model, userMessage } = opts;
  const args = [
    ...commonExecArgs(),
    "-C",
    cwd,
    "-s",
    "read-only",
    "-a",
    "never",
    "--ephemeral",
    "-m",
    model,
    wrapPrompt(systemPrompt, userMessage),
  ];
  return Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
}

// last-message tmp file helper(留作 future 用,當前用 JSONL parseResult 不需要)。
// 保留 export 供 codex feature 演進使用;避免 TS unused 警告就 void 一下。
export function _makeTmpLastMessage(): string {
  const dir = mkdtempSync(join(tmpdir(), "vp-codex-"));
  const f = join(dir, "last.txt");
  return f;
}
export function _readAndCleanTmp(f: string): string {
  if (!existsSync(f)) return "";
  const text = readFileSync(f, "utf8");
  try {
    rmSync(f, { force: true });
    rmSync(join(f, ".."), { recursive: true, force: true });
  } catch {
    // 忽略清理失敗
  }
  return text;
}

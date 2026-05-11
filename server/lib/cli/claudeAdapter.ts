// ClaudeAdapter:把既有 4 處 claude CLI spawn 行為搬進統一介面。
// 行為必須 bit-exact 對齊原檔(server/lib/qa/claudeCli.ts、splitTicket.ts、runner/orchestrator.ts):
// args 順序、flag 內容、stdin/stdout/stderr 設定都不能變。
//
// 任何修改/優化都不該寫在這裡 — 這層只負責「搬家」。

import type {
  CliAdapter,
  CliCapabilities,
  QASpawnOpts,
  RunnerSpawnOpts,
  SplitSpawnOpts,
  SpawnOpts,
  SpawnedProcess,
} from "./adapter";

export class ClaudeAdapter implements CliAdapter {
  readonly name = "claude";

  readonly capabilities: CliCapabilities = {
    supportsSessionResume: true,
    supportsTaskDispatch: true,
    supportsStreamJson: true,
    supportsToolWhitelist: true,
  };

  async checkAvailable(): Promise<boolean> {
    try {
      const proc = Bun.spawn(["claude", "--version"], { stdout: "pipe", stderr: "pipe" });
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
    // "merge" 目前不獨立 spawn — merge ticket 走 runner 主 agent + Task tool 路徑;
    // 保留 placeholder 給未來其他 CLI(例如 codex)若改成獨立 spawn 模式時填。
    throw new Error("ClaudeAdapter: 'merge' task class 不獨立 spawn,呼叫端應走 orchestrator.start");
  }

  parseResult(_kind: "qa" | "split" | "runner", stdout: string): string {
    // claude --output-format json 包成 { type:"result", result:"<text>", session_id, ... }
    const outerJson = JSON.parse(stdout) as { result?: string; text?: string; [k: string]: unknown };
    const inner = outerJson.result ?? outerJson.text ?? outerJson;
    return typeof inner === "string" ? inner : JSON.stringify(inner);
  }
}

function spawnQA(opts: QASpawnOpts): SpawnedProcess {
  const { cwd, sessionId, userMessage, isFirstTurn, systemPrompt, appendSystemPrompt, model, effort } = opts;
  const args = [
    "claude",
    "-p",
    "--output-format",
    "json",
    "--model",
    model,
    "--effort",
    effort,
  ];
  // perf flags(QA 不能加 --no-session-persistence,follow-up turn 需 --resume 讀 disk)
  args.push("--setting-sources", "");
  args.push("--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}');
  args.push("--disable-slash-commands");
  args.push("--disallowedTools", "Edit Write Task");
  if (isFirstTurn) {
    args.push("--session-id", sessionId);
    args.push("--system-prompt", systemPrompt);
  } else {
    args.push("--resume", sessionId);
    if (appendSystemPrompt !== undefined) {
      args.push("--append-system-prompt", appendSystemPrompt);
    }
  }
  args.push(userMessage);
  return Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
}

function spawnRunner(opts: RunnerSpawnOpts): SpawnedProcess {
  const { cwd, sessionId, initialMessage, systemPrompt, model, effort } = opts;
  const args = [
    "claude",
    "-p",
    "--output-format",
    "json",
    // perf:保留 --setting-sources 預設(user/project/local),因為 Task sub-agent 改 source code 時
    // 仍可能需要 user CLAUDE.md / project lint config 等繼承。
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-session-persistence",
    "--disable-slash-commands",
    "--session-id",
    sessionId,
    "--model",
    model,
    "--effort",
    effort,
    "--system-prompt",
    systemPrompt,
    initialMessage,
  ];
  return Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
}

function spawnSplit(opts: SplitSpawnOpts): SpawnedProcess {
  const { cwd, systemPrompt, model, effort, userMessage } = opts;
  const args = [
    "claude",
    "-p",
    "--output-format",
    "json",
    "--model",
    model,
    "--effort",
    effort,
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--mcp-config",
    '{"mcpServers":{}}',
    "--no-session-persistence",
    "--disable-slash-commands",
    "--system-prompt",
    systemPrompt,
    "--disallowedTools",
    "Edit Write Task",
  ];
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe", stdin: "pipe" });
  // userMessage 走 stdin(沿用既有行為);呼叫端不再自己寫 stdin
  proc.stdin.write(userMessage);
  proc.stdin.end();
  return proc;
}

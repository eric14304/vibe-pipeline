// perf-bench.ts — 量測 claude CLI spawn 三處的 before/after 加速效果。
//
// 設計:三個 case (QA 第一輪 / splitTicket / runner orchestrator),每個 case 跑
// before(舊 args,沒加 perf flag)+ after(新 args,含 --setting-sources "" /
// --strict-mcp-config 空 MCP / --disable-slash-commands / --no-session-persistence)
// 各 3 次,取 cold start ms / first-message ms / cache_creation_input_tokens / total_cost_usd
// 中位數,輸出 markdown 表格到 .perf-bench/results.md。
//
// 跑法:bun run scripts/perf-bench.ts
//
// 為了真實量到 1h prompt cache 行為,system prompt 一律用 production 完整 prompt;
// user prompt 用最短的(hello / 一張 stub ticket / noop)壓 user input cost。
//
// 注意:會真實 spawn claude CLI、會花 API 錢(預估每個 case after 路徑 ~$0.01-0.10,共 ~$0.3-1.5)。

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readFileSync } from "node:fs";

const REPO = process.cwd();
const PERF_DIR = join(REPO, ".perf-bench");
mkdirSync(PERF_DIR, { recursive: true });

// 從 source 抓 production system prompt(避免複製貼上 drift)
function readProductionPrompts(): { qa: string; runner: string; splitInline: string } {
  const qaSrc = readFileSync(join(REPO, "server/lib/qa/systemPrompt.ts"), "utf8");
  const runnerSrc = readFileSync(join(REPO, "server/lib/runner/runnerPrompt.ts"), "utf8");
  // 簡單 eval-free 抽取:用 ts dynamic import
  return {
    qa: "__USE_DYNAMIC_IMPORT__",
    runner: "__USE_DYNAMIC_IMPORT__",
    splitInline: "__USE_DYNAMIC_IMPORT__",
  };
  void qaSrc;
  void runnerSrc;
}
void readProductionPrompts;

// 改用 dynamic import 拿真實 prompt 字串
const { QA_BEHAVIOR_PROMPT } = await import(join(REPO, "server/lib/qa/systemPrompt.ts"));
const { RUNNER_BEHAVIOR_PROMPT } = await import(join(REPO, "server/lib/runner/runnerPrompt.ts"));

// splitTicket 的 SPLIT_BEHAVIOR_PROMPT 沒 export,複製過來(短)
const SPLIT_BEHAVIOR_PROMPT = [
  "你是 vibe-pipeline 的 ticket splitter。輸入是一張既有 ticket spec,輸出是把它拆成 N 張(N>=1)獨立可執行 ticket spec 的 JSON 陣列。",
  "",
  "只回 JSON 陣列,陣列元素是 ticket spec 物件(title/goal/acceptance[]/prompt/mode)。不要 markdown fence、不要解釋、不要前後綴。",
  "如果原 ticket 本來就是單一任務沒得拆,就回單元素陣列。",
].join("\n");

type CaseName = "qa" | "split" | "runner";
type Variant = "before" | "after";

type RunResult = {
  case: CaseName;
  variant: Variant;
  iter: number;
  coldStartMs: number; // spawn → first stdout chunk
  firstMessageMs: number; // spawn → first complete JSON message line
  totalMs: number; // spawn → process exit
  cacheCreationTokens: number;
  cacheReadTokens: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  exitCode: number;
  error?: string;
};

function nowMs(): number {
  return performance.now();
}

// 跑一次 spawn 並量測。stream-json 才能拿 first-message latency + usage。
async function runOnce(args: string[], stdin?: string, cwd?: string): Promise<RunResult> {
  const t0 = nowMs();
  let firstChunkAt = -1;
  let firstMessageAt = -1;
  let stdoutBuf = "";
  let stderrBuf = "";

  const proc = Bun.spawn(args, {
    cwd: cwd ?? REPO,
    stdout: "pipe",
    stderr: "pipe",
    stdin: stdin != null ? "pipe" : "inherit",
  });

  if (stdin != null && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }

  // 串流讀 stdout,偵測 first chunk + first JSON line
  const stdoutReader = proc.stdout as ReadableStream<Uint8Array>;
  const decoder = new TextDecoder();
  const reader = stdoutReader.getReader();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstChunkAt < 0) firstChunkAt = nowMs();
    const text = decoder.decode(value, { stream: true });
    stdoutBuf += text;
    buf += text;
    // stream-json:每行一個 JSON object;偵測首個非空行
    while (firstMessageAt < 0) {
      const nl = buf.indexOf("\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.length > 0) {
        try {
          JSON.parse(line);
          firstMessageAt = nowMs();
        } catch {
          // 不是 JSON line(json 模式整段一坨)— 留到 exit 後總處理
        }
      }
    }
  }

  // 收 stderr
  stderrBuf = await new Response(proc.stderr).text();
  await proc.exited;
  const totalMs = nowMs() - t0;

  // 解析 usage / cost:stream-json 最末有 type=result row;json 模式整段是 result 物件
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let costUsd = 0;
  let parseErr: string | undefined;

  // 嘗試 stream-json(line-delimited)
  const lines = stdoutBuf.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let parsedAny = false;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      parsedAny = true;
      if (obj.type === "result") {
        if (typeof obj.total_cost_usd === "number") costUsd = obj.total_cost_usd;
        else if (typeof obj.cost_usd === "number") costUsd = obj.cost_usd;
        if (obj.usage) {
          cacheCreationTokens = obj.usage.cache_creation_input_tokens ?? 0;
          cacheReadTokens = obj.usage.cache_read_input_tokens ?? 0;
          inputTokens = obj.usage.input_tokens ?? 0;
          outputTokens = obj.usage.output_tokens ?? 0;
        }
      }
    } catch {
      // skip
    }
  }
  // 若 stream-json 沒抓到、可能是 json 模式整段
  if (!parsedAny || costUsd === 0) {
    try {
      const single = JSON.parse(stdoutBuf);
      if (typeof single.total_cost_usd === "number") costUsd = single.total_cost_usd;
      else if (typeof single.cost_usd === "number") costUsd = single.cost_usd;
      if (single.usage) {
        cacheCreationTokens = single.usage.cache_creation_input_tokens ?? cacheCreationTokens;
        cacheReadTokens = single.usage.cache_read_input_tokens ?? cacheReadTokens;
        inputTokens = single.usage.input_tokens ?? inputTokens;
        outputTokens = single.usage.output_tokens ?? outputTokens;
      }
    } catch (e) {
      parseErr = `parse failed: ${String(e).slice(0, 200)}`;
    }
  }

  return {
    case: "qa",
    variant: "before",
    iter: 0,
    coldStartMs: firstChunkAt < 0 ? totalMs : firstChunkAt - t0,
    firstMessageMs: firstMessageAt < 0 ? (firstChunkAt < 0 ? totalMs : firstChunkAt - t0) : firstMessageAt - t0,
    totalMs,
    cacheCreationTokens,
    cacheReadTokens,
    inputTokens,
    outputTokens,
    costUsd,
    exitCode: proc.exitCode ?? -1,
    error:
      proc.exitCode !== 0
        ? `exit ${proc.exitCode}: ${stderrBuf.trim().slice(0, 300) || stdoutBuf.trim().slice(0, 300)}`
        : parseErr,
  };
}

// ─── Case 定義 ────────────────────────────────────────────────────────
// 每個 case 回 { before: args[], after: args[], stdin?: string, label }

function qaArgs(after: boolean): { args: string[]; stdin?: string } {
  // QA 第一輪:模擬 isFirstTurn=true、無 pipelineContext
  const sessionId = crypto.randomUUID();
  const args = [
    "claude",
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--disallowedTools",
    "Edit Write Task",
    "--session-id",
    sessionId,
    "--system-prompt",
    QA_BEHAVIOR_PROMPT,
    "hello",
  ];
  if (after) {
    // 插入 perf flag(在 --output-format 之後、--disallowedTools 之前)
    const i = args.indexOf("--disallowedTools");
    args.splice(
      i,
      0,
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--disable-slash-commands"
    );
    // QA 不能 --no-session-persistence(要 resume)
  }
  return { args };
}

function splitArgs(after: boolean): { args: string[]; stdin?: string } {
  const args = [
    "claude",
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    "claude-haiku-4-5-20251001",
    "--effort",
    "low",
    "--system-prompt",
    SPLIT_BEHAVIOR_PROMPT,
    "--disallowedTools",
    "Edit Write Task",
  ];
  if (after) {
    const i = args.indexOf("--system-prompt");
    args.splice(
      i,
      0,
      "--setting-sources",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--no-session-persistence",
      "--disable-slash-commands"
    );
  }
  const stdin =
    "請拆以下 ticket(若不需拆回單元素陣列):\n\n" +
    JSON.stringify(
      {
        title: "noop",
        goal: "stub for perf bench",
        acceptance: ["nothing"],
        prompt: "do nothing, return single-element array",
        mode: "step",
      },
      null,
      2
    );
  return { args, stdin };
}

function runnerArgs(after: boolean): { args: string[]; stdin?: string } {
  const sessionId = crypto.randomUUID();
  const args = [
    "claude",
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--session-id",
    sessionId,
    "--system-prompt",
    RUNNER_BEHAVIOR_PROMPT,
    "noop, exit immediately",
  ];
  if (after) {
    const i = args.indexOf("--session-id");
    args.splice(
      i,
      0,
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--no-session-persistence",
      "--disable-slash-commands"
    );
    // runner 保留 --setting-sources 給 Task sub-agent — 不在 after 加
  }
  return { args };
}

const cases: Array<{
  name: CaseName;
  build: (after: boolean) => { args: string[]; stdin?: string };
}> = [
  { name: "qa", build: qaArgs },
  { name: "split", build: splitArgs },
  { name: "runner", build: runnerArgs },
];

const ITER = 3;
const results: RunResult[] = [];

for (const c of cases) {
  for (const variant of ["before", "after"] as Variant[]) {
    for (let i = 1; i <= ITER; i++) {
      const { args, stdin } = c.build(variant === "after");
      console.log(`\n[${c.name} ${variant} #${i}] spawning…`);
      const t0 = nowMs();
      try {
        const r = await runOnce(args, stdin);
        r.case = c.name;
        r.variant = variant;
        r.iter = i;
        results.push(r);
        console.log(
          `  cold=${r.coldStartMs.toFixed(0)}ms first=${r.firstMessageMs.toFixed(0)}ms total=${r.totalMs.toFixed(0)}ms ` +
            `cache_create=${r.cacheCreationTokens} cache_read=${r.cacheReadTokens} cost=$${r.costUsd.toFixed(5)} exit=${r.exitCode}` +
            (r.error ? ` ERR=${r.error.slice(0, 120)}` : "")
        );
      } catch (e) {
        const totalMs = nowMs() - t0;
        const err = String(e).slice(0, 300);
        console.log(`  FAILED ${err}`);
        results.push({
          case: c.name,
          variant,
          iter: i,
          coldStartMs: 0,
          firstMessageMs: 0,
          totalMs,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          exitCode: -1,
          error: err,
        });
      }
    }
  }
}

// ─── 統計 + 寫 results.md ───────────────────────────────────────────────

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

type Agg = {
  case: CaseName;
  variant: Variant;
  n: number;
  okN: number;
  coldStartMedian: number;
  firstMessageMedian: number;
  totalMedian: number;
  cacheCreationMedian: number;
  cacheReadMedian: number;
  costMedian: number;
  errors: string[];
};

function agg(rs: RunResult[]): Agg {
  const ok = rs.filter((r) => r.exitCode === 0);
  return {
    case: rs[0]?.case ?? "qa",
    variant: rs[0]?.variant ?? "before",
    n: rs.length,
    okN: ok.length,
    coldStartMedian: median(ok.map((r) => r.coldStartMs)),
    firstMessageMedian: median(ok.map((r) => r.firstMessageMs)),
    totalMedian: median(ok.map((r) => r.totalMs)),
    cacheCreationMedian: median(ok.map((r) => r.cacheCreationTokens)),
    cacheReadMedian: median(ok.map((r) => r.cacheReadTokens)),
    costMedian: median(ok.map((r) => r.costUsd)),
    errors: rs.filter((r) => r.exitCode !== 0).map((r) => r.error ?? "?"),
  };
}

const aggs: Agg[] = [];
for (const c of cases) {
  for (const v of ["before", "after"] as Variant[]) {
    const rs = results.filter((r) => r.case === c.name && r.variant === v);
    aggs.push(agg(rs));
  }
}

function fmtPct(before: number, after: number): string {
  if (before === 0) return "n/a";
  const delta = ((after - before) / before) * 100;
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

const ts = new Date().toISOString();

let md = `# claude CLI spawn perf bench\n\n`;
md += `量測時間: ${ts}\n\n`;
md += `迭代: ${ITER} 次/case-variant,取中位數。\n\n`;
md += `指標:\n`;
md += `- **cold start**:spawn → 首個 stdout chunk(ms)\n`;
md += `- **first msg**:spawn → 首個完整 JSON line(ms)\n`;
md += `- **total**:spawn → process exit(ms)\n`;
md += `- **cache create**:usage.cache_creation_input_tokens(1h prompt cache 寫入量)\n`;
md += `- **cache read**:usage.cache_read_input_tokens\n`;
md += `- **cost**:total_cost_usd(API 收費)\n\n`;
md += `## 主表(中位數)\n\n`;
md += `| case | variant | cold start ms | first msg ms | total ms | cache create | cache read | cost USD | ok/n |\n`;
md += `|---|---|---:|---:|---:|---:|---:|---:|---:|\n`;
for (const a of aggs) {
  md += `| ${a.case} | ${a.variant} | ${a.coldStartMedian.toFixed(0)} | ${a.firstMessageMedian.toFixed(0)} | ${a.totalMedian.toFixed(0)} | ${a.cacheCreationMedian.toFixed(0)} | ${a.cacheReadMedian.toFixed(0)} | $${a.costMedian.toFixed(5)} | ${a.okN}/${a.n} |\n`;
}

md += `\n## Delta(after vs before,負值 = 更快/更省)\n\n`;
md += `| case | cold start Δ | first msg Δ | total Δ | cache create Δ | cost Δ |\n`;
md += `|---|---:|---:|---:|---:|---:|\n`;
for (const c of cases) {
  const b = aggs.find((a) => a.case === c.name && a.variant === "before")!;
  const a = aggs.find((x) => x.case === c.name && x.variant === "after")!;
  md += `| ${c.name} | ${fmtPct(b.coldStartMedian, a.coldStartMedian)} | ${fmtPct(b.firstMessageMedian, a.firstMessageMedian)} | ${fmtPct(b.totalMedian, a.totalMedian)} | ${fmtPct(b.cacheCreationMedian, a.cacheCreationMedian)} | ${fmtPct(b.costMedian, a.costMedian)} |\n`;
}

md += `\n## Raw runs\n\n`;
md += `| case | variant | iter | cold | first | total | cache_c | cache_r | in | out | cost | exit | err |\n`;
md += `|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|\n`;
for (const r of results) {
  md += `| ${r.case} | ${r.variant} | ${r.iter} | ${r.coldStartMs.toFixed(0)} | ${r.firstMessageMs.toFixed(0)} | ${r.totalMs.toFixed(0)} | ${r.cacheCreationTokens} | ${r.cacheReadTokens} | ${r.inputTokens} | ${r.outputTokens} | $${r.costUsd.toFixed(5)} | ${r.exitCode} | ${(r.error ?? "").replace(/\|/g, "/").slice(0, 80)} |\n`;
}

md += `\n## Audit / 結論\n\n`;
md += `(由執行者於量測後寫入,見 markdown 結尾段)\n`;

const outPath = join(PERF_DIR, "results.md");
writeFileSync(outPath, md, "utf8");
console.log(`\n[bench] wrote ${outPath}`);

// 也把 raw JSON 留一份方便後續分析
const jsonPath = join(PERF_DIR, `results-${Date.now()}.json`);
writeFileSync(jsonPath, JSON.stringify({ ts, results, aggs }, null, 2), "utf8");
console.log(`[bench] wrote ${jsonPath}`);

// E2E 控制端點。只在 VP_TEST_MODE=mock 時 mount(server/index.ts 守)。
// real 模式不存在這些 routes,擋住意外被 production 端點呼叫。

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as projectStore from "../lib/projectStore";
import * as testMode from "../lib/testMode";
import type { QAReply } from "../lib/qa/schema";
import type { RunnerScript } from "../lib/testMode";

function ok(data: unknown): Response {
  return Response.json({ ok: true, data });
}
function err(code: string, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

// POST /api/__test/register-project
// body: { path: string, ensureInit?: boolean, seedPipelines?: Pipeline[] }
// 把 path 加進 recents,選擇性 init .vibe-pipeline/。回 hash 給 spec 用。
export async function registerProject(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    path?: string;
    ensureInit?: boolean;
    seedPipelines?: Array<{ id: string; [k: string]: unknown }>;
  };
  if (!body.path) return err("bad_request", "path required");

  if (body.ensureInit) {
    const dir = join(body.path, ".vibe-pipeline");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const pipelinesDir = join(dir, "pipelines");
    if (!existsSync(pipelinesDir)) mkdirSync(pipelinesDir, { recursive: true });
    const configPath = join(dir, "config.json");
    if (!existsSync(configPath)) {
      writeFileSync(
        configPath,
        JSON.stringify({ defaults: { merge_strategy: "squash" } }, null, 2)
      );
    }
    if (Array.isArray(body.seedPipelines)) {
      for (const p of body.seedPipelines) {
        writeFileSync(
          join(pipelinesDir, `${p.id}.json`),
          JSON.stringify(p, null, 2)
        );
      }
    }
  }

  const project = await projectStore.open(body.path);
  return ok({ hash: project.hash, project });
}

// POST /api/__test/script/qa
// body: { hash: string, replies: QAReply[] }
export async function setQAScript(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    hash?: string;
    replies?: QAReply[];
  };
  if (!body.hash || !Array.isArray(body.replies)) {
    return err("bad_request", "hash + replies[] required");
  }
  testMode.setQAScript(body.hash, body.replies);
  return ok({ count: body.replies.length });
}

// POST /api/__test/script/runner
// body: { hash: string, pipelineId: string, script: RunnerScript }
export async function setRunnerScript(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => ({}))) as {
    hash?: string;
    pipelineId?: string;
    script?: RunnerScript;
  };
  if (!body.hash || !body.pipelineId || !body.script) {
    return err("bad_request", "hash + pipelineId + script required");
  }
  testMode.setRunnerScript(body.hash, body.pipelineId, body.script);
  return ok({ ticketCount: body.script.tickets.length });
}

// POST /api/__test/reset
// 清所有 in-memory mock state(QA / runner script)。
// 不動 fs(每 spec 自己用獨立 tmpdir,不靠 reset)。
export async function reset(): Promise<Response> {
  testMode.resetMocks();
  return ok({});
}

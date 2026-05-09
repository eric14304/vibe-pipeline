import * as projectStore from "../lib/projectStore";
import * as pipelineDir from "../lib/pipelineDir";
import * as draftStore from "../lib/qa/draftStore";
import * as cli from "../lib/qa/claudeCli";
import type { ApiResponse, ApiErrorCode } from "../../shared/types";


function ok<T>(data: T): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>);
}
function err(code: ApiErrorCode, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } } satisfies ApiResponse<never>, {
    status,
  });
}
async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function projectFor(hash: string) {
  const p = await projectStore.findByHash(hash);
  if (!p) return { error: err("not_found", `Project not found: ${hash}`, 404) };
  if (!pipelineDir.hasInit(p.path))
    return { error: err("not_initialized", `.vibe-pipeline/ not found in ${p.path}`) };
  return { project: p };
}

export async function start(hash: string, pipelineId: string, req: Request): Promise<Response> {
  const r = await projectFor(hash);
  if ("error" in r) return r.error;
  const { project } = r;

  const pipeline = await pipelineDir.readPipeline(project.path, pipelineId);
  if (!pipeline) return err("not_found", `Pipeline not found: ${pipelineId}`, 404);

  const existing = await draftStore.findActiveByPipeline(project.path, pipelineId);
  if (existing) {
    return Response.json(
      {
        ok: false,
        error: { code: "already_initialized", message: "Active draft exists" },
        data: { draftId: existing.draftId },
      },
      { status: 409 }
    );
  }

  if (!(await cli.checkAvailable())) {
    return err(
      "internal_error",
      "claude CLI 不可用 — 請確認已安裝並登入(brew install claude / npm i -g @anthropic-ai/claude-code,然後 `claude login`)",
      503
    );
  }

  // 不打 claude — draft 建好,frontend 會顯示寫死的第一句 + 選項。
  // 第一個真實 claude turn 由 user 點選項 / 打字觸發 /turn。
  const draft = await draftStore.createDraft(project.path, pipelineId);
  return ok({ draft });
}

export async function turn(hash: string, draftId: string, req: Request): Promise<Response> {
  const r = await projectFor(hash);
  if ("error" in r) return r.error;
  const { project } = r;

  const body = await readJson(req);
  const userMessage = (body.userMessage as string) ?? "";
  if (!userMessage.trim()) return err("invalid_path", "userMessage required");

  const draft = await draftStore.readDraft(project.path, draftId);
  if (!draft) return err("not_found", `Draft not found: ${draftId}`, 404);

  const isFirstTurn = !draft.sessionStarted;
  let reply;
  try {
    reply = await cli.runTurn({
      cwd: project.path,
      sessionId: draft.sessionId,
      userMessage,
      isFirstTurn,
    });
  } catch (e) {
    return err("internal_error", String(e), 500);
  }

  if (isFirstTurn) await draftStore.markStarted(project.path, draftId);
  const updated = await draftStore.appendTurn(project.path, draftId, userMessage, reply);
  return ok({ draft: updated, reply });
}

export async function finalize(hash: string, draftId: string, req: Request): Promise<Response> {
  const r = await projectFor(hash);
  if ("error" in r) return r.error;
  const { project } = r;

  const draft = await draftStore.readDraft(project.path, draftId);
  if (!draft) return err("not_found", `Draft not found: ${draftId}`, 404);
  if (!draft.spec) return err("invalid_path", "Draft spec not ready");

  const body = await readJson(req);
  const edits = (body.edits as Partial<typeof draft.spec>) ?? {};
  const finalSpec = { ...draft.spec, ...edits };
  const required: (keyof typeof finalSpec)[] = ["title", "goal", "acceptance", "prompt", "mode"];
  const missing = required.filter((k) => {
    const v = finalSpec[k];
    return v == null || v === "" || (Array.isArray(v) && v.length === 0);
  });
  if (missing.length > 0)
    return err("invalid_path", `Spec incomplete, missing: ${missing.join(", ")}`);

  const pipeline = (await pipelineDir.readPipeline(project.path, draft.pipelineId)) as {
    tickets?: unknown[];
    [k: string]: unknown;
  } | null;
  if (!pipeline) return err("not_found", `Pipeline not found: ${draft.pipelineId}`, 404);

  const existingTickets = Array.isArray(pipeline.tickets) ? pipeline.tickets : [];
  const ticket = {
    id: `t${existingTickets.length + 1}-${Date.now().toString(16)}`,
    n: existingTickets.length + 1,
    status: "draft",
    ...finalSpec,
  };
  const updatedPipeline = { ...pipeline, tickets: [...existingTickets, ticket] };
  await pipelineDir.writePipeline(project.path, draft.pipelineId, updatedPipeline);
  await draftStore.deleteDraft(project.path, draftId);

  return ok({ ticket, pipeline: updatedPipeline });
}

export async function cancel(hash: string, draftId: string): Promise<Response> {
  const r = await projectFor(hash);
  if ("error" in r) return r.error;
  await draftStore.deleteDraft(r.project.path, draftId);
  return ok({ ok: true });
}

export async function listDrafts(hash: string): Promise<Response> {
  const r = await projectFor(hash);
  if ("error" in r) return r.error;
  const drafts = await draftStore.listDrafts(r.project.path);
  return ok(drafts);
}

export async function getDraft(hash: string, draftId: string): Promise<Response> {
  const r = await projectFor(hash);
  if ("error" in r) return r.error;
  const d = await draftStore.readDraft(r.project.path, draftId);
  if (!d) return err("not_found", `Draft not found: ${draftId}`, 404);
  return ok(d);
}

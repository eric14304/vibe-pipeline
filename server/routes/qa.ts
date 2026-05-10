import * as projectStore from "../lib/projectStore";
import * as pipelineDir from "../lib/pipelineDir";
import * as draftStore from "../lib/qa/draftStore";
import * as cli from "../lib/qa/claudeCli";
import type { ApiResponse, ApiErrorCode, PartialSpec } from "../../shared/types";

const REQUIRED_FIELDS: { key: keyof PartialSpec; label: string }[] = [
  { key: "title", label: "title(15 字內)" },
  { key: "goal", label: "goal(一句 why)" },
  { key: "acceptance", label: "acceptance(陣列,1-3 條可驗收)" },
  { key: "prompt", label: "prompt(給執行AI 的完整指令)" },
  { key: "mode", label: 'mode("step" 或 "iter")' },
];

function fieldFilled(spec: PartialSpec | null, key: keyof PartialSpec): boolean {
  if (!spec) return false;
  const v = spec[key];
  if (v == null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  if (key === "mode") return v === "step" || v === "iter";
  return true;
}

function buildProgressHint(spec: PartialSpec | null, turnNumber: number): string {
  const filled = REQUIRED_FIELDS.filter((f) => fieldFilled(spec, f.key));
  const missing = REQUIRED_FIELDS.filter((f) => !fieldFilled(spec, f.key));
  if (missing.length === 0) {
    return `當前進度:5/5 齊。這輪 spec 必須包含全部 5 欄位內容(不可塌陷),complete 設 true,結束對話。`;
  }
  const filledStr = filled.length > 0 ? filled.map((f) => f.key).join(" / ") : "(無)";
  const missingStr = missing.map((f) => f.label).join(" / ");
  let urgency = "";
  if (turnNumber >= 4) {
    urgency =
      "\n**已第 " +
      turnNumber +
      " 輪,你必須這輪自行填好所有缺的欄位**(用合理預設,不要再問問題)。" +
      "spec 必須含 5 個欄位完整內容,complete 設 true。" +
      "user 答得抽象就你判斷,不要無限拖。";
  } else if (turnNumber >= 3) {
    urgency = "\n第 " + turnNumber + " 輪了,加快推進,1-2 輪內收齊。";
  }
  return `當前進度:${filled.length}/5 齊(已收:${filledStr})。還缺:${missingStr}。${urgency}`;
}



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

export async function start(hash: string, pipelineId: string, _req: Request): Promise<Response> {
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

  // 算 progress hint 讓 AI 知道目前進度 + 還缺什麼。
  // 規則:
  // - 累計 user 輪數 >= 3 且 spec < 5/5 → 強催 AI 自填預設一次到位
  // - spec partial → 列缺欄位
  const userTurns = draft.turns.filter((t) => t.role === "user").length;
  const progressHint = !isFirstTurn ? buildProgressHint(draft.spec, userTurns + 1) : undefined;

  let reply: Awaited<ReturnType<typeof cli.runTurn>>;
  try {
    reply = await cli.runTurn({
      cwd: project.path,
      sessionId: draft.sessionId,
      userMessage,
      isFirstTurn,
      progressHint,
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

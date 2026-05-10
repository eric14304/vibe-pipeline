import * as projects from "./routes/projects";
import * as qa from "./routes/qa";
import * as test from "./routes/test";
import * as projectStore from "./lib/projectStore";
import * as orchestrator from "./lib/runner/orchestrator";
import * as testMode from "./lib/testMode";

const PORT = Number(process.env.PORT ?? 3001);

function notFound(): Response {
  return Response.json(
    { ok: false, error: { code: "not_found", message: "Route not found" } },
    { status: 404 }
  );
}

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method;

  if (pathname === "/api/health" && method === "GET") {
    return Response.json({ ok: true, data: { status: "up", testMode: testMode.isTestMode() } });
  }

  // E2E 控制端點 — 只 mock 模式 mount,real 模式 404
  if (testMode.isTestMode() && pathname.startsWith("/api/__test/")) {
    if (pathname === "/api/__test/register-project" && method === "POST")
      return test.registerProject(req);
    if (pathname === "/api/__test/script/qa" && method === "POST")
      return test.setQAScript(req);
    if (pathname === "/api/__test/script/runner" && method === "POST")
      return test.setRunnerScript(req);
    if (pathname === "/api/__test/reset" && method === "POST") return test.reset();
    return notFound();
  }

  if (pathname === "/api/projects" && method === "GET") {
    return projects.listRecent();
  }
  if (pathname === "/api/projects/select" && method === "POST") {
    return projects.selectFolder();
  }
  if (pathname === "/api/projects/open" && method === "POST") {
    return projects.openProject(req);
  }

  const projectMatch = pathname.match(/^\/api\/projects\/([a-f0-9]{8})(\/.*)?$/);
  if (projectMatch) {
    const hash = projectMatch[1];
    const rest = projectMatch[2] ?? "";

    if (rest === "/status" && method === "GET") return projects.status(hash);
    if (rest === "/init" && method === "POST") return projects.init(hash);
    if (rest === "/git-init" && method === "POST") return projects.gitInit(hash);
    if (rest === "/reveal" && method === "POST") return projects.reveal(hash);
    if (rest === "/branches" && method === "GET") return projects.listBranches(hash);
    if (rest === "/config" && method === "GET") return projects.getConfig(hash);
    if (rest === "/config" && method === "PUT") return projects.updateConfig(hash, req);
    if (rest === "/runtime" && method === "GET") return projects.getRuntime(hash);
    if (rest === "/pipelines" && method === "GET") return projects.listPipelines(hash);
    if (rest === "/pipelines" && method === "POST") return projects.createPipeline(hash, req);
    const pipelineMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)$/);
    if (pipelineMatch) {
      const id = pipelineMatch[1];
      if (method === "GET") return projects.getPipeline(hash, id);
      if (method === "PUT") return projects.savePipeline(hash, id, req);
      if (method === "DELETE") return projects.deletePipeline(hash, id);
    }

    const pipelineRunMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)\/(run|pause|merge)$/);
    if (pipelineRunMatch && method === "POST") {
      const id = pipelineRunMatch[1];
      const action = pipelineRunMatch[2];
      if (action === "run") return projects.runPipeline(hash, id);
      if (action === "pause") return projects.pausePipeline(hash, id);
      if (action === "merge") return projects.mergePipeline(hash, id);
    }

    const worktreeRevealMatch = rest.match(
      /^\/pipelines\/([a-z0-9_-]+)\/worktree\/reveal$/
    );
    if (worktreeRevealMatch && method === "POST") {
      return projects.revealWorktree(hash, worktreeRevealMatch[1]);
    }

    const diffStatMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)\/diff-stat$/);
    if (diffStatMatch && method === "GET") {
      return projects.pipelineDiffStat(hash, diffStatMatch[1]);
    }

    const diffFullMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)\/diff$/);
    if (diffFullMatch && method === "GET") {
      return projects.pipelineDiff(hash, diffFullMatch[1]);
    }

    const pipelineRunsListMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)\/runs$/);
    if (pipelineRunsListMatch && method === "GET") {
      return projects.listPipelineRuns(hash, pipelineRunsListMatch[1]);
    }
    const pipelineRunsDetailMatch = rest.match(
      /^\/pipelines\/([a-z0-9_-]+)\/runs\/([A-Za-z0-9._-]+)$/
    );
    if (pipelineRunsDetailMatch && method === "GET") {
      return projects.getPipelineRun(
        hash,
        pipelineRunsDetailMatch[1],
        pipelineRunsDetailMatch[2]
      );
    }

    if (rest === "/notifs" && method === "GET") return projects.listNotifs(hash);
    if (rest === "/notifs/mark-all-read" && method === "POST")
      return projects.markAllNotifsRead(hash);
    const notifMatch = rest.match(/^\/notifs\/([a-z0-9]+)\/(read|dismiss)$/);
    if (notifMatch && method === "POST") {
      const nid = notifMatch[1];
      if (notifMatch[2] === "read") return projects.markNotifRead(hash, nid);
      if (notifMatch[2] === "dismiss") return projects.dismissNotif(hash, nid);
    }

    const qaStartMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)\/qa\/start$/);
    if (qaStartMatch && method === "POST") return qa.start(hash, qaStartMatch[1], req);

    if (rest === "/qa/drafts" && method === "GET") return qa.listDrafts(hash);

    const qaDraftMatch = rest.match(/^\/qa\/([a-f0-9]+)(\/.*)?$/);
    if (qaDraftMatch) {
      const draftId = qaDraftMatch[1];
      const sub = qaDraftMatch[2] ?? "";
      if (sub === "" && method === "GET") return qa.getDraft(hash, draftId);
      if (sub === "/turn" && method === "POST") return qa.turn(hash, draftId, req);
      if (sub === "/finalize" && method === "POST") return qa.finalize(hash, draftId, req);
      if (sub === "/cancel" && method === "POST") return qa.cancel(hash, draftId);
    }
  }

  return notFound();
}

const server = Bun.serve({
  port: PORT,
  hostname: "127.0.0.1",
  async fetch(req) {
    try {
      return await handle(req);
    } catch (e) {
      return Response.json(
        { ok: false, error: { code: "internal_error", message: String(e) } },
        { status: 500 }
      );
    }
  },
});

console.log(`vibe-pipeline backend listening on http://${server.hostname}:${server.port}`);

// Crash recovery: 啟動時掃所有有 .vibe-pipeline/ 的 recent project,
// 若 pipeline.state="running" 或 "stopping" 但 process 不在 (server 重啟),標 paused
(async () => {
  try {
    const recents = await projectStore.listRecent();
    for (const p of recents) {
      if (!p.hasInit) continue;
      try {
        await orchestrator.recoverStale(p.path);
      } catch (e) {
        console.error(`[recover] ${p.path} failed:`, e);
      }
    }
  } catch (e) {
    console.error("[recover] scan failed:", e);
  }
})();

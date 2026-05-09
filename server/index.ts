import * as projects from "./routes/projects";
import * as qa from "./routes/qa";

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
    return Response.json({ ok: true, data: { status: "up" } });
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
    if (rest === "/pipelines" && method === "GET") return projects.listPipelines(hash);
    if (rest === "/pipelines" && method === "POST") return projects.createPipeline(hash, req);
    const pipelineMatch = rest.match(/^\/pipelines\/([a-z0-9_-]+)$/);
    if (pipelineMatch) {
      const id = pipelineMatch[1];
      if (method === "GET") return projects.getPipeline(hash, id);
      if (method === "PUT") return projects.savePipeline(hash, id, req);
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

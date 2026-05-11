import { test, expect } from "@playwright/test";
import { createTempProject, cleanupTempProject, gitIn, type TempProject } from "../helpers/temp-project";
import { resetMocks, setRunnerScript, type RunnerScript } from "../helpers/mock-control";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

let proj: TempProject;
const API = "http://127.0.0.1:3003/api";

test.beforeEach(async () => {
  await resetMocks();
});

test.afterEach(() => {
  if (proj) cleanupTempProject(proj);
});

// 在 fixture 內預建 pipeline branch + commit,讓 auto-merge ticket 真有東西可 merge
function preBuildBranch(projectPath: string, branch: string, fileName: string): void {
  gitIn(projectPath, ["checkout", "-b", branch]);
  writeFileSync(join(projectPath, fileName), `// added on ${branch}\n`);
  gitIn(projectPath, ["add", fileName]);
  gitIn(projectPath, ["commit", "-m", `feat: add ${fileName}`]);
  gitIn(projectPath, ["checkout", "main"]);
}

test("PUT /config 接受 auto_merge:boolean,GET 拿得回", async ({ request }) => {
  proj = await createTempProject();
  // 預設 false
  const initial = await request.get(`${API}/projects/${proj.hash}/config`);
  const initialBody = await initial.json();
  expect(initialBody.data.defaults.auto_merge).toBe(false);

  // PUT true
  const put = await request.put(`${API}/projects/${proj.hash}/config`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    data: { defaults: { auto_merge: true } },
  });
  const putBody = await put.json();
  expect(put.ok()).toBe(true);
  expect(putBody.data.defaults.auto_merge).toBe(true);

  // PUT 非 boolean → 400
  const bad = await request.put(`${API}/projects/${proj.hash}/config`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    data: { defaults: { auto_merge: "yes" } },
  });
  expect(bad.status()).toBe(400);
});

test("POST /pipelines 沒帶 autoMerge → 讀 project config defaults.auto_merge", async ({ request }) => {
  proj = await createTempProject();
  // 設 default true
  await request.put(`${API}/projects/${proj.hash}/config`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    data: { defaults: { auto_merge: true } },
  });

  const create = await request.post(`${API}/projects/${proj.hash}/pipelines`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    data: { name: "auto-on", branch: "pipeline/auto-on", baseBranch: "main", state: "planning", tickets: [] },
  });
  const body = await create.json();
  expect(body.data.autoMerge).toBe(true);

  // body 顯式帶 false → 蓋過 default
  const create2 = await request.post(`${API}/projects/${proj.hash}/pipelines`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    data: {
      name: "manual",
      branch: "pipeline/manual",
      baseBranch: "main",
      state: "planning",
      tickets: [],
      autoMerge: false,
    },
  });
  const body2 = await create2.json();
  expect(body2.data.autoMerge).toBe(false);
});

test("Pipeline autoMerge=true:全 ticket done → state ready 後 backend 自動 append merge ticket", async ({ request }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p-auto",
        name: "auto-pipe",
        branch: "pipeline/auto-pipe",
        baseBranch: "main",
        state: "planning",
        autoMerge: true,
        tickets: [
          {
            id: "t1",
            n: 1,
            title: "do thing",
            goal: "g",
            acceptance: ["a"],
            prompt: "p",
            mode: "step",
            status: "ready",
          },
        ],
      },
    ],
  });
  preBuildBranch(proj.path, "pipeline/auto-pipe", "auto-feature.ts");

  const script: RunnerScript = {
    tickets: [
      {
        beforeRunningMs: 30,
        workMs: 60,
        finalStatus: "done",
        commitHash: "mock-auto-1",
        commitSubject: "ticket(1): do thing",
      },
    ],
    finalState: "ready",
  };
  await setRunnerScript(proj.hash, "p-auto", script);

  // 觸發 run
  const runRes = await request.post(`${API}/projects/${proj.hash}/pipelines/p-auto/run`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  expect(runRes.ok()).toBe(true);

  // 等到 backend 自動 append merge ticket
  // mock runner workMs ~60ms + auto-merge spawn 後再起一條 mock runner;polling 看 tickets[1].mode === "merge"
  let mergeAppended = false;
  let autoMergeNotif = false;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const pipeRes = await request.get(`${API}/projects/${proj.hash}/pipelines/p-auto`);
    const pipeBody = await pipeRes.json();
    const tickets = pipeBody.data.tickets ?? [];
    if (tickets.some((t: { mode?: string }) => t.mode === "merge")) {
      mergeAppended = true;
    }
    const notifRes = await request.get(`${API}/projects/${proj.hash}/notifs`);
    const notifBody = await notifRes.json();
    if ((notifBody.data ?? []).some((n: { type?: string }) => n.type === "pipeline_auto_merge_started")) {
      autoMergeNotif = true;
    }
    if (mergeAppended && autoMergeNotif) break;
  }
  expect(mergeAppended).toBe(true);
  expect(autoMergeNotif).toBe(true);
});

test("Pipeline autoMerge=false:全 ticket done → ready 後不自動 append merge ticket", async ({ request }) => {
  proj = await createTempProject({
    pipelines: [
      {
        id: "p-manual",
        name: "manual-pipe",
        branch: "pipeline/manual-pipe",
        baseBranch: "main",
        state: "planning",
        autoMerge: false,
        tickets: [
          {
            id: "t1",
            n: 1,
            title: "do thing",
            goal: "g",
            acceptance: ["a"],
            prompt: "p",
            mode: "step",
            status: "ready",
          },
        ],
      },
    ],
  });

  const script: RunnerScript = {
    tickets: [
      {
        beforeRunningMs: 30,
        workMs: 60,
        finalStatus: "done",
        commitHash: "mock-manual-1",
      },
    ],
    finalState: "ready",
  };
  await setRunnerScript(proj.hash, "p-manual", script);

  await request.post(`${API}/projects/${proj.hash}/pipelines/p-manual/run`, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });

  // 等 ready
  let reached = false;
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 200));
    const pipeRes = await request.get(`${API}/projects/${proj.hash}/pipelines/p-manual`);
    const pipeBody = await pipeRes.json();
    if (pipeBody.data.state === "ready") {
      reached = true;
      break;
    }
  }
  expect(reached).toBe(true);

  // 等多幾輪確認沒自動加 merge ticket
  await new Promise((r) => setTimeout(r, 500));
  const pipeRes = await request.get(`${API}/projects/${proj.hash}/pipelines/p-manual`);
  const pipeBody = await pipeRes.json();
  const tickets = pipeBody.data.tickets ?? [];
  expect(tickets.some((t: { mode?: string }) => t.mode === "merge")).toBe(false);
});

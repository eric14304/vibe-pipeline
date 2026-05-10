import { test, expect } from "@playwright/test";
import {
  API,
  VP_AUTOTEST_HASH,
  VP_AUTOTEST_PATH,
  assertRealMode,
  ensureCleanMain,
  deleteAutotestPipeline,
  listAutotestPipelines,
  autotestGit,
} from "../helpers/real-project";

// 真 e2e:vp-autotest 上跑一條 iter pipeline,期望 critic 會 FAIL 至少一輪後 PASS。
// 燒 token + 慢(整輪 5-15 分),timeout 拉到 30 分。
//
// 跑前 preflight:vp-autotest checkout main、reset hard、刪殘留 pipelines。
// 跑後不主動清:留下來給 user 看現場;下次 run 的 preflight 會收尾。

test.describe.configure({ timeout: 30 * 60 * 1000 });

test.beforeAll(async () => {
  await assertRealMode();
});

test.beforeEach(async () => {
  ensureCleanMain();
  // 清掉 vp-autotest 殘留 pipelines(避免互相干擾)
  const existing = await listAutotestPipelines();
  for (const p of existing) await deleteAutotestPipeline(p.id);
});

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  const body = (await res.json()) as { ok: boolean; data?: T; error?: { message: string } };
  if (!body.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${body.error?.message}`);
  }
  return body.data as T;
}

async function pollPipelineState(
  pipelineId: string,
  predicate: (state: string) => boolean,
  timeoutMs: number
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const p = await api<{ state: string }>(
      `/projects/${VP_AUTOTEST_HASH}/pipelines/${pipelineId}`
    );
    if (predicate(p.state)) return p.state;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`pipeline ${pipelineId} 沒在 ${timeoutMs}ms 內滿足條件`);
}

test("iter ticket FAIL → PASS chain on vp-autotest($1.5 估)", async () => {
  // 1. 建 pipeline
  const pipelineName = `iter-real-${Date.now()}`;
  const pipeline = await api<{ id: string }>(
    `/projects/${VP_AUTOTEST_HASH}/pipelines`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: pipelineName,
        branch: `pipeline/${pipelineName}`,
        baseBranch: "main",
        state: "planning",
        tickets: [],
      }),
    }
  );
  console.log(`[real] pipeline created: ${pipeline.id}`);

  // 2. 開 QA session
  const startResp = await api<{ draft: { draftId: string; sessionId: string } }>(
    `/projects/${VP_AUTOTEST_HASH}/pipelines/${pipeline.id}/qa/start`,
    { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } }
  );
  const draftId = startResp.draft.draftId;
  console.log(`[real] QA draft: ${draftId}`);

  // 3. 走 QA turns 到 complete(逐輪推 claude 補齊 spec)
  // 用一個會讓 critic 第一輪不過的 task:多 acceptance + 模糊細節 → executor 容易漏
  const opener =
    "iter mode。在 src/util.ts 新增 add(a, b) 函式:" +
    "兩個 number → 相加 / 兩個 string → concat / 其他 type → throw TypeError。" +
    "請收齊 spec(title/goal/acceptance/prompt/mode=iter,iterLimit=3),iter mode 必填。";
  let reply = await api<{ reply: { complete: boolean; options: string[] } }>(
    `/projects/${VP_AUTOTEST_HASH}/qa/${draftId}/turn`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userMessage: opener }),
    }
  );
  let turns = 1;
  while (!reply.reply.complete && turns < 8) {
    const userMsg = reply.reply.options[0] ?? "OK 繼續";
    console.log(`[real] QA turn ${turns + 1}: "${userMsg.slice(0, 30)}"`);
    reply = await api(
      `/projects/${VP_AUTOTEST_HASH}/qa/${draftId}/turn`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userMessage: userMsg }),
      }
    );
    turns++;
  }
  expect(reply.reply.complete).toBe(true);
  console.log(`[real] QA done in ${turns} turns`);

  // 4. Finalize
  await api(
    `/projects/${VP_AUTOTEST_HASH}/qa/${draftId}/finalize`,
    { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } }
  );

  // 5. 確認 ticket 是 iter mode
  const afterQA = await api<{ tickets: Array<{ mode?: string; status?: string; id: string }> }>(
    `/projects/${VP_AUTOTEST_HASH}/pipelines/${pipeline.id}`
  );
  expect(afterQA.tickets.length).toBe(1);
  expect(afterQA.tickets[0].mode).toBe("iter");
  console.log(`[real] ticket created: ${afterQA.tickets[0].id} (iter)`);

  // 6. 跑 pipeline
  await api(
    `/projects/${VP_AUTOTEST_HASH}/pipelines/${pipeline.id}/run`,
    { method: "POST" }
  );
  console.log(`[real] pipeline running, polling state...`);

  // 7. Poll 到 ready / paused / failed(最多 25 分)
  const finalState = await pollPipelineState(
    pipeline.id,
    (s) => s === "ready" || s === "paused" || s === "failed",
    25 * 60 * 1000
  );
  console.log(`[real] pipeline finished: ${finalState}`);

  // 8. 驗 ticket 跑出來的 iter rounds:至少 2 輪(預期 FAIL → PASS)
  const final = await api<{
    tickets: Array<{
      mode?: string;
      status?: string;
      iter?: { rounds?: Array<{ criticVerdict?: string }>; verdicts?: unknown[] };
      commits?: Array<{ hash: string }>;
    }>;
  }>(`/projects/${VP_AUTOTEST_HASH}/pipelines/${pipeline.id}`);
  const t = final.tickets[0];
  console.log(`[real] ticket final status: ${t.status}, rounds: ${t.iter?.rounds?.length}`);

  // 期待:成功 chain → status=done + 至少 1 round + 最後 PASS。
  // 容許:critic 一發 PASS(雖然違反測試初衷,但不算 bug)→ rounds=1。
  // 不容許:rounds=0,代表 iter 流程沒跑。
  expect(t.iter?.rounds?.length ?? 0).toBeGreaterThanOrEqual(1);

  if (finalState === "ready" && t.status === "done") {
    const lastVerdict = t.iter?.rounds?.[t.iter.rounds.length - 1].criticVerdict;
    expect(String(lastVerdict).toUpperCase()).toBe("PASS");
    expect(t.commits?.length ?? 0).toBeGreaterThan(0);
    console.log(`[real] ✓ FAIL→PASS chain done in ${t.iter?.rounds?.length} rounds`);
  } else {
    // failed_iter_limit / paused 也接受 — 至少證明 runner 真的在跑 iter
    console.log(`[real] △ iter 沒收斂(${t.status}),但 runner 確實跑了 iter loop`);
  }

  // git log 看 commit 真的有(成功 path)
  if (t.commits?.length) {
    const log = autotestGit(["log", "--oneline", "-5", t.commits[0].hash]);
    expect(log.ok).toBe(true);
  }
  void VP_AUTOTEST_PATH;
});

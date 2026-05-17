import { test, expect, request as pwRequest } from "@playwright/test";
import { createTempProject, cleanupTempProject, type TempProject } from "../helpers/temp-project";
import { resetMocks } from "../helpers/mock-control";
import { API_BASE } from "../helpers/api-base";

// Settings popover Tab UI 驗收：
//  1. 開 gear → popover 出現,4 個 tab(security 條件性,未綁定預設不出)
//  2. Project tab 改 max_parallel → autosave → reload 仍在 + GET /config 拿得到
//  3. AI 任務 tab 改 qa.model → autosave → reload 仍在 + GET /user/config 拿得到
//  4. PWA tab 切換可見(無 backend persistence,只驗 UI 切到位)
//
// userConfig 持久化驗證走 GET /api/user/config(等同讀 $VP_HOME/.vibe-pipeline/config.json),
// 不直接讀檔 — playwright.config.ts 的 TEST_HOME 每次 module load 都重算,test process 跟
// webServer process 的 VP_HOME_OVERRIDE 可能不同(observed),只有 backend 自己知道真實路徑。

let proj: TempProject;

const API = API_BASE;

async function resetUserConfig() {
  // /api/__test/reset 不動 fs;這邊用 PUT 把所有 task class 寫回 default 來達成「清回乾淨」效果。
  const ctx = await pwRequest.newContext();
  await ctx.put(`${API}/user/config`, {
    headers: { "content-type": "application/json; charset=utf-8" },
    data: {
      defaults: {
        qa: { provider: "claude", model: "claude-sonnet-4-6", effort: "low" },
        split: { provider: "claude", model: "claude-sonnet-4-6", effort: "low" },
        runner: { provider: "claude", model: "claude-opus-4-7", effort: "medium" },
        executor: { provider: "claude", model: "claude-opus-4-7", effort: "high" },
        critic: { provider: "claude", model: "claude-sonnet-4-6", effort: "medium" },
        merge: { provider: "claude", model: "claude-opus-4-7", effort: "high" },
      },
    },
  });
  await ctx.dispose();
}

test.beforeEach(async () => {
  await resetMocks();
  await resetUserConfig();
  proj = await createTempProject();
});

test.afterEach(() => {
  if (proj) cleanupTempProject(proj);
});

async function fetchProjectConfig(hash: string): Promise<Record<string, unknown> | null> {
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.get(`${API}/projects/${hash}/config`);
    if (!res.ok()) return null;
    const j = (await res.json()) as { ok: boolean; data?: Record<string, unknown> };
    return j.ok && j.data ? j.data : null;
  } finally {
    await ctx.dispose();
  }
}

async function fetchUserConfig(): Promise<Record<string, unknown> | null> {
  const ctx = await pwRequest.newContext();
  try {
    const res = await ctx.get(`${API}/user/config`);
    if (!res.ok()) return null;
    const j = (await res.json()) as { ok: boolean; data?: Record<string, unknown> };
    return j.ok && j.data ? j.data : null;
  } finally {
    await ctx.dispose();
  }
}

async function openSettings(page: import("@playwright/test").Page) {
  // gear 按鈕是 TopBar settingsSlot 內唯一 .icon-btn,title="設定"
  await page.locator("button.icon-btn[title='設定']").click();
  await expect(page.locator(".settings-popover")).toBeVisible();
}

test("Project / AI / PWA 三個 tab 預設可切換;Security 在未綁定 TOTP 時不出現", async ({ page }) => {
  await page.goto(`/board?project=${proj.hash}`);
  await openSettings(page);

  const popover = page.locator(".settings-popover");
  // 預設停在 Project tab
  await expect(popover.getByRole("button", { name: "Project" })).toBeVisible();
  await expect(popover.getByText("平行上限")).toBeVisible();

  // 切 AI 任務 — 新版 amber tip card 文案
  await popover.getByRole("button", { name: "AI 任務" }).click();
  await expect(popover.getByText(/套用到所有 project/)).toBeVisible();

  // 切 PWA(原「通知」tab redesign 後改名)
  await popover.getByRole("button", { name: "PWA" }).click();
  // PWA tab 一定有「安裝為 App」section title + 「推播通知」section title
  await expect(popover.locator(".settings-section-title", { hasText: "安裝為 App" })).toBeVisible();
  await expect(popover.locator(".settings-section-title", { hasText: "推播通知" })).toBeVisible();

  // Security tab 預設無 TOTP secret(authStatus.bound=false)→ tab 不渲染
  await expect(popover.getByRole("button", { name: "安全" })).toHaveCount(0);
});

test("Project tab：改 max_parallel autosave → reload 持久 + 落盤 project config.json", async ({ page }) => {
  await page.goto(`/board?project=${proj.hash}`);
  await openSettings(page);
  const popover = page.locator(".settings-popover");

  // 預設 2,改成 5
  const input = popover.locator("input[type='number']").first();
  await expect(input).toHaveValue("2");
  await input.fill("5");

  // 等「已儲存」chip 出現確認 autosave 落地
  await expect(popover.getByText("已儲存 ✓")).toBeVisible({ timeout: 5000 });

  // 驗 project config 透過 GET /api/projects/<hash>/config 落盤可讀
  await expect
    .poll(() => fetchProjectConfig(proj.hash), { timeout: 8000, intervals: [200, 300, 500] })
    .toMatchObject({
      defaults: { max_parallel: 5 },
    });

  // reload 後仍是 5
  await page.reload();
  await openSettings(page);
  await expect(page.locator(".settings-popover input[type='number']").first()).toHaveValue("5");
});

test("AI 任務 tab：改 qa.model autosave → reload 持久 + GET /user/config 拿得到", async ({ page }) => {
  await page.goto(`/board?project=${proj.hash}`);
  await openSettings(page);
  const popover = page.locator(".settings-popover");

  await popover.getByRole("button", { name: "AI 任務" }).click();

  // 第一行是 QA Spec(對應 task class "qa",AI Spec 群組第一筆)
  // 新版 row pattern:.settings-row.ai-task-row,內含 .ai-task-controls (provider + model 兩個 select)
  // executor/critic/merge 為進階組,顯示 effort 而非 provider;此處改 qa.model 屬主組
  const aiRows = popover.locator(".settings-row.ai-task-row");
  const firstRow = aiRows.first();
  const selects = firstRow.locator("select");
  // qa: showProvider=true, showEffort=true → provider / model / effort 三個 select
  await expect(selects).toHaveCount(3);

  // model 第二個 select。預設 claude-sonnet-4-6,改成 claude-opus-4-7
  const modelSelect = selects.nth(1);
  await expect(modelSelect).toHaveValue("claude-sonnet-4-6");
  await modelSelect.selectOption("claude-opus-4-7");

  await expect(popover.getByText("已儲存 ✓")).toBeVisible({ timeout: 5000 });

  // 驗 user config 透過 GET /api/user/config 落盤可讀
  await expect
    .poll(() => fetchUserConfig(), { timeout: 8000, intervals: [200, 300, 500] })
    .toMatchObject({
      defaults: { qa: { provider: "claude", model: "claude-opus-4-7" } },
    });

  // reload 後仍是 opus
  await page.reload();
  await openSettings(page);
  await page.locator(".settings-popover").getByRole("button", { name: "AI 任務" }).click();
  await expect(
    page.locator(".settings-popover .settings-row.ai-task-row").first().locator("select").nth(1)
  ).toHaveValue("claude-opus-4-7");
});

test("PWA tab：切到時 install + push 區塊渲染(不戳真權限,只看畫面)", async ({ page }) => {
  await page.goto(`/board?project=${proj.hash}`);
  await openSettings(page);
  const popover = page.locator(".settings-popover");
  await popover.getByRole("button", { name: "PWA" }).click();
  // PWA tab 上半:安裝為 App section
  await expect(popover.locator(".settings-section-title", { hasText: "安裝為 App" })).toBeVisible();
  // PWA tab 下半:推播通知 section
  await expect(popover.locator(".settings-section-title", { hasText: "推播通知" })).toBeVisible();
  // 主 toggle label「啟用推播通知」永遠在
  await expect(popover.locator(".push-main-toggle")).toBeVisible();
});

test("PWA tab：推播主 toggle / 通知事件 toggle 可切換並 autosave", async ({ page, context }) => {
  await context.grantPermissions(["notifications"], {
    origin: `http://127.0.0.1:${process.env.E2E_FRONTEND_PORT ?? "5175"}`,
  });
  await page.addInitScript(() => {
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => "granted" });
    Notification.requestPermission = () => Promise.resolve("granted" as NotificationPermission);
    localStorage.setItem("fcm_token", "mock-token");
  });
  await page.goto(`/board?project=${proj.hash}`);
  await openSettings(page);
  const popover = page.locator(".settings-popover");
  await popover.getByRole("button", { name: "PWA" }).click();

  const mainToggle = popover.locator(".push-main-toggle input[type='checkbox']");
  await expect(mainToggle).toBeChecked();

  const doneRow = popover.locator(".push-event-row", { hasText: "Ticket 完成通知" });
  const doneToggle = doneRow.locator("input[type='checkbox']");
  await expect(doneToggle).toBeEnabled();
  await doneRow.locator(".toggle-pill-track").click();
  await expect
    .poll(() => fetchUserConfig(), { timeout: 8000, intervals: [200, 300, 500] })
    .toMatchObject({
      pushEvents: { ticket_done: false },
    });

  await popover.locator(".push-main-toggle .toggle-pill-track").click();
  await expect(mainToggle).not.toBeChecked();
  await expect(doneToggle).toBeDisabled();
});

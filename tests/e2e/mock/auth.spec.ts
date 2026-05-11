import { test, expect, request as pwRequest } from "@playwright/test";
import { resetMocks } from "../helpers/mock-control";

// TOTP auth e2e mock spec — 3 scenario(Setup happy path / Cookie 過期 / Loopback bypass)。
//
// 依賴的 test-only escape hatch:
//  - server/index.ts:VP_TEST_MODE=mock 時讀 X-Forwarded-For 覆寫 srv.requestIP() 推得的 IP
//  - server/routes/auth.ts:VP_TEST_MODE=mock 時 verifyTotp 接受固定 code「123456」(避開真實時鐘計算)
//  - server/routes/test.ts:/api/__test/auth/reset、/api/__test/auth/seed-secret
//
// 三個都用 NODE_ENV/VP_TEST_MODE gate,production build 永遠走真路徑。

const API = "http://127.0.0.1:3003";
const REMOTE_IP = "100.64.0.1"; // 模擬 Tailscale 端,非 loopback,會被 authGuard 攔
const LOOPBACK_IP = "127.0.0.1";

async function authReset() {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${API}/api/__test/auth/reset`);
  expect(res.ok()).toBe(true);
  await ctx.dispose();
}

async function authSeedSecret() {
  const ctx = await pwRequest.newContext();
  const res = await ctx.post(`${API}/api/__test/auth/seed-secret`, { data: {} });
  expect(res.ok()).toBe(true);
  await ctx.dispose();
}

test.beforeEach(async () => {
  await resetMocks();
  await authReset();
});

test.afterEach(async () => {
  // 清回乾淨狀態,避免污染下一個 spec
  await authReset();
});

test("Setup happy path:無 secret + 非 loopback → setup-init 拿 QR → setup-verify 200 + 拿 cookie", async () => {
  // 不帶 cookie context,模擬首次連進來
  const ctx = await pwRequest.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": REMOTE_IP },
  });

  // 1. 沒登入打 /api/projects → 401 + redirect=/setup
  const guarded = await ctx.get(`${API}/api/projects`);
  expect(guarded.status()).toBe(401);
  const guardedBody = await guarded.json();
  expect(guardedBody.error.redirect).toBe("/setup");

  // 2. setup-init bypass → 拿到 qr_svg + setup_token
  const initRes = await ctx.post(`${API}/api/auth/setup-init`);
  expect(initRes.ok()).toBe(true);
  const initJson = await initRes.json();
  expect(initJson.ok).toBe(true);
  expect(typeof initJson.data.qr_svg).toBe("string");
  expect(initJson.data.qr_svg).toContain("<svg");
  expect(typeof initJson.data.setup_token).toBe("string");

  // 3. 用 mock 固定碼 123456 驗證
  const verifyRes = await ctx.post(`${API}/api/auth/setup-verify`, {
    data: { setup_token: initJson.data.setup_token, code: "123456" },
  });
  expect(verifyRes.ok()).toBe(true);
  const setCookie = verifyRes.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain("vp_auth=");

  // 4. 拿著 cookie 再打受保護 endpoint → 通
  // (playwright context 自己會帶 cookie)
  const after = await ctx.get(`${API}/api/projects`);
  expect(after.status()).toBe(200);

  await ctx.dispose();
});

test("Cookie 過期 / 沒 cookie:有 secret + 非 loopback → 401 redirect=/login → login 拿新 cookie", async () => {
  // 預先 seed 一個 fake secret(模擬已綁定但 session 都清掉)
  await authSeedSecret();

  const ctx = await pwRequest.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": REMOTE_IP },
  });

  // 1. 打受保護 → 401 redirect=/login
  const guarded = await ctx.get(`${API}/api/projects`);
  expect(guarded.status()).toBe(401);
  const guardedBody = await guarded.json();
  expect(guardedBody.error.redirect).toBe("/login");

  // 2. 用 123456 login → 200 + Set-Cookie
  const loginRes = await ctx.post(`${API}/api/auth/login`, {
    data: { code: "123456" },
  });
  expect(loginRes.ok()).toBe(true);
  const setCookie = loginRes.headers()["set-cookie"];
  expect(setCookie).toBeTruthy();
  expect(setCookie).toContain("vp_auth=");

  // 3. 再打受保護 → 通
  const after = await ctx.get(`${API}/api/projects`);
  expect(after.status()).toBe(200);

  await ctx.dispose();
});

test("Loopback bypass:127.0.0.1 + 無 cookie + 無 secret → 直通,不走 setup/login", async () => {
  const ctx = await pwRequest.newContext({
    extraHTTPHeaders: { "X-Forwarded-For": LOOPBACK_IP },
  });

  // /api/projects 直接 200
  const res = await ctx.get(`${API}/api/projects`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.ok).toBe(true);

  // /api/health 也通
  const health = await ctx.get(`${API}/api/health`);
  expect(health.ok()).toBe(true);

  await ctx.dispose();
});

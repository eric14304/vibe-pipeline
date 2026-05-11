import { err, readJson } from "./_http";
import * as tokenStore from "../lib/push/tokenStore";
import { fanoutPush, isFCMReady } from "../lib/fcm";

function readToken(body: Record<string, unknown>): string | null {
  const token = body.token;
  if (typeof token !== "string") return null;
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function register(req: Request): Promise<Response> {
  const body = await readJson(req);
  const token = readToken(body);
  console.log(`[push/register] body keys: ${Object.keys(body).join(",")}, token len: ${token?.length ?? 0}`);
  if (!token) return err("invalid_path", "token 必須為非空字串", 400);
  const platform = typeof body.platform === "string" ? body.platform : "unknown";
  const record = await tokenStore.registerToken(token, platform);
  console.log(`[push/register] OK platform=${platform}, total tokens=${(await tokenStore.listTokens()).length}`);
  return Response.json({ token: record }, { status: 201 });
}

export async function unregister(req: Request): Promise<Response> {
  const body = await readJson(req);
  const token = readToken(body);
  if (!token) return err("invalid_path", "token 必須為非空字串", 400);
  await tokenStore.unregisterToken(token);
  return new Response(null, { status: 204 });
}

export async function tokens(): Promise<Response> {
  return Response.json({ tokens: await tokenStore.listTokens() });
}

// Smoke test:對所有 registered tokens fan-out 一發測試 push,驗證鏈路
export async function test(): Promise<Response> {
  if (!isFCMReady()) {
    return err("not_initialized", "FCM Admin SDK 未初始化(檢查 FCM_SERVICE_ACCOUNT_PATH)", 500);
  }
  const records = await tokenStore.listTokens();
  if (records.length === 0) {
    return err("invalid_path", "沒任何已註冊的 device token(先在 Settings → 通知 啟用)", 400);
  }
  const ts = new Date().toLocaleTimeString();
  const dead = await fanoutPush(
    records.map((r) => r.token),
    {
      notification: {
        title: "vibe-pipeline 測試推播",
        body: `從 backend 發送 · ${ts}`,
      },
      data: { url: "/board" },
    }
  );
  if (dead.length > 0) await tokenStore.removeDeadTokens(dead);
  return Response.json({
    sent: records.length,
    dead: dead.length,
    ts,
  });
}

export function config(): Response {
  return Response.json({
    apiKey: process.env.FCM_API_KEY ?? "",
    authDomain: process.env.FCM_AUTH_DOMAIN ?? "",
    projectId: process.env.FCM_PROJECT_ID ?? "",
    storageBucket: process.env.FCM_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.FCM_MESSAGING_SENDER_ID ?? "",
    appId: process.env.FCM_APP_ID ?? "",
    vapidKey: process.env.FCM_VAPID_KEY ?? "",
  });
}

import { readFileSync } from "node:fs";
import admin from "firebase-admin";

let app: admin.app.App | null = null;
let ready = false;

function parseServiceAccount(): admin.ServiceAccount | null {
  const inline = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (inline && inline.trim().length > 0) {
    try {
      return JSON.parse(inline) as admin.ServiceAccount;
    } catch (e) {
      console.error("[FCM] FCM_SERVICE_ACCOUNT_JSON 解析失敗:", e);
      return null;
    }
  }
  const path = process.env.FCM_SERVICE_ACCOUNT_PATH;
  if (path && path.trim().length > 0) {
    try {
      const raw = readFileSync(path, "utf8");
      return JSON.parse(raw) as admin.ServiceAccount;
    } catch (e) {
      console.error(`[FCM] 讀取 FCM_SERVICE_ACCOUNT_PATH (${path}) 失敗:`, e);
      return null;
    }
  }
  return null;
}

export function initFCM(): void {
  if (ready) return;
  const sa = parseServiceAccount();
  if (!sa) {
    console.warn("[FCM] 未設定 service account,push 功能停用");
    return;
  }
  try {
    app = admin.initializeApp({ credential: admin.credential.cert(sa) });
    ready = true;
    console.log("[FCM] initialized");
  } catch (e) {
    console.error("[FCM] initializeApp 失敗:", e);
  }
}

export function isFCMReady(): boolean {
  return ready;
}

export type FCMPayload = {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
};

const DEAD_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

export async function fanoutPush(
  tokens: string[],
  payload: FCMPayload
): Promise<string[]> {
  if (!ready || !app) return [];
  const uniq = Array.from(new Set(tokens.map((t) => t.trim()).filter(Boolean)));
  if (uniq.length === 0) return [];

  const dead: string[] = [];
  // sendEachForMulticast 上限 500 token / call
  for (let i = 0; i < uniq.length; i += 500) {
    const chunk = uniq.slice(i, i + 500);
    try {
      const res = await admin.messaging(app).sendEachForMulticast({
        tokens: chunk,
        notification: payload.notification,
        data: payload.data,
      });
      res.responses.forEach((r, idx) => {
        if (r.success) return;
        const code = r.error?.code ?? "";
        if (DEAD_TOKEN_ERRORS.has(code)) {
          dead.push(chunk[idx]);
        } else {
          console.error(`[FCM] send error (${code}):`, r.error?.message);
        }
      });
    } catch (e) {
      console.error("[FCM] sendEachForMulticast 失敗:", e);
    }
  }
  return dead;
}

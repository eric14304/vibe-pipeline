import { readFileSync } from "node:fs";

type FirebaseAppApi = {
  apps?: unknown[];
  initializeApp: (options: { credential: unknown }) => unknown;
  credential: {
    cert: (serviceAccount: Record<string, unknown>) => unknown;
  };
  messaging: () => {
    sendEachForMulticast: (message: {
      tokens: string[];
      notification?: { title?: string; body?: string };
      data?: Record<string, string>;
    }) => Promise<{
      responses: Array<{ success: boolean; error?: { code?: string } }>;
    }>;
  };
};

export type FcmPayload = {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
};

export const fakeFcmCalls: Array<{ tokens: string[]; payload: object; ts: number }> = [];

let ready = false;
let initStarted = false;
let initPromise: Promise<boolean> | null = null;
let admin: FirebaseAppApi | null = null;

function isMockMode(): boolean {
  return process.env.VP_TEST_MODE === "mock";
}

function loadServiceAccount(): Record<string, unknown> | null {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  const path = process.env.FCM_SERVICE_ACCOUNT_PATH?.trim();
  if (!json && !path) {
    console.warn("[FCM] 未設定 service account,push 功能停用");
    return null;
  }
  const text = json || readFileSync(path as string, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("FCM service account must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export function initFCM(): Promise<boolean> {
  if (isMockMode()) {
    initStarted = true;
    ready = true;
    return Promise.resolve(true);
  }
  if (initPromise) return initPromise;
  initStarted = true;
  initPromise = (async () => {
    try {
      const serviceAccount = loadServiceAccount();
      if (!serviceAccount) return false;

      // @ts-ignore firebase-admin is installed as an app dependency.
      const adminModule = await import("firebase-admin");
      admin = ((adminModule as { default?: unknown }).default ?? adminModule) as FirebaseAppApi;

      if ((admin.apps ?? []).length === 0) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
      }
      ready = true;
      return true;
    } catch (e) {
      ready = false;
      console.error("[FCM] 初始化失敗,push 功能停用:", e);
      return false;
    }
  })();
  return initPromise;
}

export function isFCMReady(): boolean {
  if (isMockMode()) return true;
  return ready;
}

export async function fanoutPush(tokens: string[], payload: FcmPayload): Promise<string[]> {
  if (isMockMode()) {
    const normalizedTokens = Array.from(new Set(tokens.map((t) => t.trim()).filter(Boolean)));
    fakeFcmCalls.push({
      tokens: normalizedTokens,
      payload: {
        notification: payload.notification ? { ...payload.notification } : undefined,
        data: payload.data ? { ...payload.data } : undefined,
      },
      ts: Date.now(),
    });
    return [];
  }

  if (!initStarted) await initFCM();
  if (!ready || !admin) return [];

  const normalizedTokens = Array.from(new Set(tokens.map((t) => t.trim()).filter(Boolean)));
  const deadTokens: string[] = [];
  for (let i = 0; i < normalizedTokens.length; i += 500) {
    const chunk = normalizedTokens.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const res = await admin.messaging().sendEachForMulticast({
      tokens: chunk,
      notification: payload.notification,
      data: payload.data,
    });
    res.responses.forEach((r, idx) => {
      if (r.success) return;
      if (r.error?.code === "messaging/registration-token-not-registered") {
        deadTokens.push(chunk[idx]);
      }
    });
  }
  return deadTokens;
}

export function resetFakeFcmCalls(): void {
  fakeFcmCalls.length = 0;
}

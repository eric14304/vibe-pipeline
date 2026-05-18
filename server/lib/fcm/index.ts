export type FcmPayload = {
  notification?: { title?: string; body?: string };
  data?: Record<string, string>;
};

export const fakeFcmCalls: Array<{ tokens: string[]; payload: object; ts: number }> = [];

function isMockMode(): boolean {
  return process.env.VP_TEST_MODE === "mock";
}

function gatewayUrl(): string | null {
  const v = process.env.PUSH_GATEWAY_URL?.trim();
  return v && v.length > 0 ? v.replace(/\/+$/, "") : null;
}

function gatewayToken(): string | null {
  const v = process.env.PUSH_GATEWAY_TOKEN?.trim();
  return v && v.length > 0 ? v : null;
}

export function initFCM(): Promise<boolean> {
  if (isMockMode()) return Promise.resolve(true);
  const ready = !!(gatewayUrl() && gatewayToken());
  if (!ready) {
    console.warn("[FCM] PUSH_GATEWAY_URL / PUSH_GATEWAY_TOKEN 未設定,push 功能停用");
  }
  return Promise.resolve(ready);
}

export function isFCMReady(): boolean {
  if (isMockMode()) return true;
  return !!(gatewayUrl() && gatewayToken());
}

type SendResponse = {
  sent?: number;
  failed?: Array<{ deviceToken?: string; deviceId?: string; code?: string; error?: string }>;
};

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

  const url = gatewayUrl();
  const tok = gatewayToken();
  if (!url || !tok) {
    console.warn("[FCM] gateway 未設定,跳過 fanout");
    return [];
  }

  // tokens arg 被 gateway 端 device registry 取代(gateway 是 SSOT);
  // 這裡只是為了維持 signature 與 mock fakeFcmCalls 行為一致。
  const title = payload.notification?.title ?? "";
  const body = payload.notification?.body ?? "";
  if (!title || !body) {
    console.warn("[FCM] title / body 缺,gateway 會拒,跳過");
    return [];
  }
  const data = payload.data ? { ...payload.data } : undefined;
  const ticketId = data?.workUnitId ?? data?.ticketId;

  try {
    const res = await fetch(`${url}/push/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify({ title, body, data, ticketId }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[FCM] gateway /push/send ${res.status}: ${text}`);
      return [];
    }
    const json = (await res.json().catch(() => null)) as SendResponse | null;
    const failed = json?.failed ?? [];
    const dead: string[] = [];
    for (const f of failed) {
      if (
        f.code === "messaging/registration-token-not-registered" ||
        f.code === "messaging/invalid-registration-token"
      ) {
        if (typeof f.deviceToken === "string" && f.deviceToken.length > 0) {
          dead.push(f.deviceToken);
        }
      }
    }
    return dead;
  } catch (e) {
    console.error("[FCM] gateway /push/send 失敗:", e);
    return [];
  }
}

export function resetFakeFcmCalls(): void {
  fakeFcmCalls.length = 0;
}

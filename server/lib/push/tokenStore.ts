// Gateway 上線後,device token registry 的 SSOT 在 gateway(Firestore),
// 本地不再保留 device_tokens.json。register / unregister 改成轉發 gateway,
// listTokens 回 sentinel(fanoutPush 不看個別 token,gateway 端 fanout 全部 device),
// removeDeadTokens 是 no-op(gateway 收到 invalid-token 會自己刪)。

export type DeviceTokenRecord = {
  id: string;
  token: string;
  platform: string;
  created_at: string;
  last_seen_at: string;
};

function gatewayUrl(): string | null {
  const v = process.env.PUSH_GATEWAY_URL?.trim();
  return v && v.length > 0 ? v.replace(/\/+$/, "") : null;
}

function gatewayToken(): string | null {
  const v = process.env.PUSH_GATEWAY_TOKEN?.trim();
  return v && v.length > 0 ? v : null;
}

async function postGateway(path: string, body: object): Promise<Response | null> {
  const url = gatewayUrl();
  const tok = gatewayToken();
  if (!url || !tok) {
    console.warn(`[push] gateway 未設定,跳過 ${path}`);
    return null;
  }
  try {
    return await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.error(`[push] gateway ${path} 失敗:`, e);
    return null;
  }
}

export async function registerToken(
  token: string,
  platform = "unknown"
): Promise<DeviceTokenRecord> {
  const normalizedToken = token.trim();
  const normalizedPlatform = platform.trim() || "unknown";
  const now = new Date().toISOString();
  const res = await postGateway("/push/register", {
    deviceToken: normalizedToken,
    label: normalizedPlatform,
  });
  if (res && !res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[push] /push/register ${res.status}: ${text}`);
  }
  return {
    id: normalizedToken,
    token: normalizedToken,
    platform: normalizedPlatform,
    created_at: now,
    last_seen_at: now,
  };
}

export async function unregisterToken(token: string): Promise<void> {
  const normalizedToken = token.trim();
  const res = await postGateway("/push/unregister", { deviceToken: normalizedToken });
  if (res && !res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[push] /push/unregister ${res.status}: ${text}`);
  }
}

// Sentinel:gateway 是 device registry SSOT,VP backend 不再持有 device list。
// 回 1 個假 record 讓 ticketWatcher / orchestrator 的 `records.length > 0` 判斷成立,
// 真正的 fanout 在 gateway 端做。
export async function listTokens(): Promise<DeviceTokenRecord[]> {
  const url = gatewayUrl();
  const tok = gatewayToken();
  if (!url || !tok) return [];
  const now = new Date().toISOString();
  return [
    {
      id: "gateway",
      token: "gateway",
      platform: "gateway",
      created_at: now,
      last_seen_at: now,
    },
  ];
}

// No-op:dead token 由 gateway 端 invalid-registration-token 自動刪除,
// VP backend 不再維護 token list。保留 signature 讓 call site 不必改。
export async function removeDeadTokens(_deadTokens: string[]): Promise<void> {
  return;
}

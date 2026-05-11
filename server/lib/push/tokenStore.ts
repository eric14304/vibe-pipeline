import { existsSync, mkdirSync, renameSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { vibeHome } from "../paths";

export type DeviceTokenRecord = {
  id: string;
  token: string;
  platform: string;
  created_at: string;
  last_seen_at: string;
};

type StoreShape = {
  tokens: DeviceTokenRecord[];
};

function dir(): string {
  return join(vibeHome(), ".vibe-pipeline");
}

function file(): string {
  return join(dir(), "device_tokens.json");
}

function emptyStore(): StoreShape {
  return { tokens: [] };
}

async function readStore(): Promise<StoreShape> {
  const f = file();
  if (!existsSync(f)) return emptyStore();
  try {
    const raw = JSON.parse(await Bun.file(f).text()) as unknown;
    if (!raw || typeof raw !== "object") return emptyStore();
    const tokens = (raw as { tokens?: unknown }).tokens;
    if (!Array.isArray(tokens)) return emptyStore();
    return {
      tokens: tokens.filter(isDeviceTokenRecord),
    };
  } catch {
    return emptyStore();
  }
}

function isDeviceTokenRecord(v: unknown): v is DeviceTokenRecord {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.token === "string" &&
    typeof o.platform === "string" &&
    typeof o.created_at === "string" &&
    typeof o.last_seen_at === "string"
  );
}

async function writeStore(store: StoreShape): Promise<void> {
  if (!existsSync(dir())) mkdirSync(dir(), { recursive: true });
  const text = JSON.stringify(store, null, 2) + "\n";
  JSON.parse(text);
  const tmp = `${file()}.tmp`;
  await Bun.write(tmp, text);
  try {
    renameSync(tmp, file());
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {}
    throw e;
  }
}

export async function registerToken(
  token: string,
  platform = "unknown"
): Promise<DeviceTokenRecord> {
  const normalizedToken = token.trim();
  const normalizedPlatform = platform.trim() || "unknown";
  const store = await readStore();
  const now = new Date().toISOString();
  const idx = store.tokens.findIndex((t) => t.token === normalizedToken);
  if (idx >= 0) {
    store.tokens[idx] = {
      ...store.tokens[idx],
      platform: normalizedPlatform,
      last_seen_at: now,
    };
    await writeStore(store);
    return store.tokens[idx];
  }
  const record: DeviceTokenRecord = {
    id: crypto.randomUUID(),
    token: normalizedToken,
    platform: normalizedPlatform,
    created_at: now,
    last_seen_at: now,
  };
  store.tokens.push(record);
  await writeStore(store);
  return record;
}

export async function unregisterToken(token: string): Promise<void> {
  const normalizedToken = token.trim();
  const store = await readStore();
  const next = store.tokens.filter((t) => t.token !== normalizedToken);
  if (next.length === store.tokens.length) return;
  await writeStore({ tokens: next });
}

export async function listTokens(): Promise<DeviceTokenRecord[]> {
  return (await readStore()).tokens;
}

export async function removeDeadTokens(deadTokens: string[]): Promise<void> {
  const dead = new Set(deadTokens.map((t) => t.trim()).filter(Boolean));
  if (dead.size === 0) return;
  const store = await readStore();
  const next = store.tokens.filter((t) => !dead.has(t.token));
  if (next.length === store.tokens.length) return;
  await writeStore({ tokens: next });
}

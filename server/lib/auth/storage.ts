import { join } from "node:path";
import { mkdir, rename, writeFile, chmod, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { vibeHome } from "../paths";

export type AuthSession = {
  cookieHash: string;
  ip: string;
  ua: string;
  createdAt: number;
  lastActiveAt: number;
};

export type AuthState = {
  totp_secret: string | null;
  boundAt: number | null;
  sessions: AuthSession[];
};

function authDir(): string {
  return join(vibeHome(), ".vibe-pipeline");
}

function authFilePath(): string {
  return join(authDir(), "auth.json");
}

const EMPTY: AuthState = {
  totp_secret: null,
  boundAt: null,
  sessions: [],
};

export async function readAuth(): Promise<AuthState> {
  const path = authFilePath();
  if (!existsSync(path)) return { ...EMPTY };
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return {
      totp_secret: parsed.totp_secret ?? null,
      boundAt: parsed.boundAt ?? null,
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function writeAuth(state: AuthState): Promise<void> {
  const dir = authDir();
  await mkdir(dir, { recursive: true });
  const finalPath = authFilePath();
  const tmpPath = finalPath + ".tmp";
  const data = JSON.stringify(state, null, 2) + "\n";
  await writeFile(tmpPath, data, "utf8");
  // chmod 0600 — Windows 上 node fs.chmod 只保留 read-only bit,實際 ACL 不會限制其他 user
  // 真實安全只在 POSIX(macOS / Linux)成立;Windows 仰賴 user profile 目錄的 NTFS 預設權限
  try {
    await chmod(tmpPath, 0o600);
  } catch {}
  await rename(tmpPath, finalPath);
  try {
    await chmod(finalPath, 0o600);
  } catch {}
}

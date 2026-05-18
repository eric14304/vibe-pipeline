import { closeSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ParsedArgs } from "../lib/args";
import { fail, isJsonMode, okJson, print } from "../lib/output";
import {
  detectServerRepoPath,
  rememberServerRepoPath,
  serverLogPath,
  serverPidPath,
  serverStateDir,
} from "../lib/serverPath";

const SERVER_PORT = Number(process.env["VBPL_SERVER_PORT"] ?? 3001);
const SERVER_BASE = `http://127.0.0.1:${SERVER_PORT}`;
const HEALTH_URL = `${SERVER_BASE}/api/health`;
const START_TIMEOUT_MS = 5_000;
const POLL_MS = 200;

const SERVER_USAGE = `vbpl server — manage vibe-pipeline backend

  vbpl server start
  vbpl server stop`;

type HealthInfo = {
  ok: boolean;
  pid: number | null;
  repoPath: string | null;
};

export async function runServer(sub: string | undefined, args: ParsedArgs): Promise<void> {
  if (sub === "help" || args.flags["help"] === true) {
    print(SERVER_USAGE);
    return;
  }
  switch (sub) {
    case "start": return serverStart();
    case "stop":  return serverStop();
    default:
      fail("INVALID_ARGS", `Unknown server subcommand: ${sub ?? "(none)"}. Use start|stop (or 'vbpl server help')`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function samePath(a: string, b: string): boolean {
  const left = resolve(a);
  const right = resolve(b);
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

async function readPidFile(): Promise<number | null> {
  try {
    const raw = await readFile(serverPidPath(), "utf8");
    const pid = Number(raw.trim());
    if (!Number.isInteger(pid) || pid <= 0) return null;
    return pid;
  } catch {
    return null;
  }
}

async function healthInfo(timeoutMs = 500): Promise<HealthInfo> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(HEALTH_URL, { method: "GET", signal: controller.signal });
    if (res.status !== 200) return { ok: false, pid: null, repoPath: null };
    const body = await res.json().catch(() => null) as {
      data?: { pid?: unknown; repo_path?: unknown; repoPath?: unknown };
    } | null;
    const pid = typeof body?.data?.pid === "number" ? body.data.pid : null;
    const rawRepoPath = body?.data?.repo_path ?? body?.data?.repoPath;
    const repoPath = typeof rawRepoPath === "string" && rawRepoPath.length > 0 ? rawRepoPath : null;
    return { ok: true, pid, repoPath };
  } catch {
    return { ok: false, pid: null, repoPath: null };
  } finally {
    clearTimeout(timer);
  }
}

async function healthOk(timeoutMs = 500): Promise<boolean> {
  return (await healthInfo(timeoutMs)).ok;
}

async function waitForHealthUp(): Promise<boolean> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await healthOk()) return true;
    await sleep(POLL_MS);
  }
  return healthOk();
}

async function waitForHealthDown(): Promise<boolean> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!(await healthOk())) return true;
    await sleep(POLL_MS);
  }
  return !(await healthOk());
}

async function serverStart(): Promise<void> {
  const repoPath = await detectServerRepoPath();
  const initialHealth = await healthInfo();
  if (initialHealth.ok) {
    const pidFile = await readPidFile();
    if (
      pidFile == null ||
      initialHealth.pid == null ||
      initialHealth.pid !== pidFile ||
      initialHealth.repoPath == null ||
      !samePath(initialHealth.repoPath, repoPath)
    ) {
      fail(
        "PORT_IN_USE",
        `${SERVER_BASE} 已有非 vbpl server start 管理的 backend。請先停止該 backend,或確認 server.pid/repo_path。`,
      );
    }
    await rememberServerRepoPath(repoPath);
    if (isJsonMode()) {
      okJson({ started: false, alreadyRunning: true, pid: initialHealth.pid, repoPath, url: SERVER_BASE });
      return;
    }
    print("已在跑");
    return;
  }

  await mkdir(serverStateDir(), { recursive: true });
  const logPath = serverLogPath();
  const pidPath = serverPidPath();

  let stdoutFd: number | null = null;
  let stderrFd: number | null = null;
  let child: ReturnType<typeof Bun.spawn>;
  try {
    stdoutFd = openSync(logPath, "a");
    stderrFd = openSync(logPath, "a");
    child = Bun.spawn(["bun", "run", "server/index.ts"], {
      cwd: repoPath,
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ["ignore", stdoutFd, stderrFd],
      detached: true,
      windowsHide: true,
    } as Parameters<typeof Bun.spawn>[1]);
    child.unref();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    fail("IO_ERROR", `啟動 backend 失敗:${msg}`);
  } finally {
    if (stdoutFd != null) closeSync(stdoutFd);
    if (stderrFd != null) closeSync(stderrFd);
  }

  await writeFile(pidPath, String(child.pid) + "\n", "utf8");

  if (!(await waitForHealthUp())) {
    try {
      process.kill(child.pid);
    } catch {
      // best effort cleanup after a failed start
    }
    await rm(pidPath, { force: true });
    fail("START_TIMEOUT", `backend 5s 內沒有通過 health check。log:${logPath}`);
  }

  const startedHealth = await healthInfo();
  if (
    !startedHealth.ok ||
    startedHealth.pid !== child.pid ||
    startedHealth.repoPath == null ||
    !samePath(startedHealth.repoPath, repoPath)
  ) {
    try {
      process.kill(child.pid);
    } catch {
      // best effort cleanup after a failed start
    }
    await rm(pidPath, { force: true });
    fail("PORT_IN_USE", `${SERVER_BASE} health 回應不屬於剛啟動的 vbpl backend。log:${logPath}`);
  }

  await rememberServerRepoPath(repoPath);

  if (isJsonMode()) {
    okJson({ started: true, pid: child.pid, repoPath, logPath, url: SERVER_BASE });
    return;
  }
  print("已啟動");
}

async function readPid(): Promise<number> {
  let raw: string;
  try {
    raw = await readFile(serverPidPath(), "utf8");
  } catch {
    fail("NOT_FOUND", "找不到 server.pid;沒有可停止的 vbpl server");
  }
  const pid = Number(raw.trim());
  if (!Number.isInteger(pid) || pid <= 0) {
    fail("INVALID_ARGS", `server.pid 內容無效:${raw.trim()}`);
  }
  return pid;
}

async function clearStalePid(pid: number, reason: string): Promise<void> {
  await rm(serverPidPath(), { force: true });
  if (isJsonMode()) {
    okJson({ stopped: false, stalePidCleared: true, pid, reason });
    return;
  }
  print("server.pid 已過期，已清除");
}

async function serverStop(): Promise<void> {
  const pid = await readPid();
  const repoPath = await detectServerRepoPath();
  const currentHealth = await healthInfo();
  if (!currentHealth.ok) {
    await clearStalePid(pid, "health_down");
    return;
  }
  if (currentHealth.pid !== pid) {
    await clearStalePid(pid, "pid_mismatch");
    return;
  }
  if (currentHealth.repoPath == null || !samePath(currentHealth.repoPath, repoPath)) {
    await clearStalePid(pid, "repo_path_mismatch");
    return;
  }
  try {
    process.kill(pid);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code !== "ESRCH") {
      const msg = e instanceof Error ? e.message : String(e);
      fail("IO_ERROR", `停止 backend 失敗:${msg}`);
    }
  }
  await rm(serverPidPath(), { force: true });

  const stopped = await waitForHealthDown();
  if (!stopped) {
    fail("IO_ERROR", "已送出停止訊號,但 /api/health 仍可連線");
  }

  if (isJsonMode()) {
    okJson({ stopped: true, pid });
    return;
  }
  print("已停止");
}

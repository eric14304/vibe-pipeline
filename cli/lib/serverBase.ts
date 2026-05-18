import { fail } from "./output";

const DEFAULT_SERVER_PORT = 3001;

export function serverPort(): number {
  const raw = process.env["VBPL_SERVER_PORT"];
  const port = raw == null ? DEFAULT_SERVER_PORT : Number(raw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    fail("INVALID_ARGS", `VBPL_SERVER_PORT 無效:${raw}`);
  }
  return port;
}

export function localServerBase(): string {
  return `http://127.0.0.1:${serverPort()}`;
}

export function apiBase(): string {
  return process.env["VBPL_API_BASE"] || localServerBase();
}

function normalizeLoopback(hostname: string): string {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" ? "loopback" : hostname;
}

export function isLocalApiBase(): boolean {
  try {
    const api = new URL(apiBase());
    const local = new URL(localServerBase());
    return (
      api.protocol === local.protocol &&
      normalizeLoopback(api.hostname) === normalizeLoopback(local.hostname) &&
      api.port === local.port
    );
  } catch {
    return false;
  }
}

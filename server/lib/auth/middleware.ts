import { readAuth, writeAuth } from "./storage";
import { COOKIE_NAME, findSession, parseCookie } from "./cookie";

const LOOPBACK_IPS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

const BYPASS_PATHS = new Set([
  "/api/auth/setup-init",
  "/api/auth/setup-verify",
  "/api/auth/login",
  "/api/auth/status",
]);

export function isLoopback(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return LOOPBACK_IPS.has(ip);
}

export function isBypassPath(pathname: string): boolean {
  return BYPASS_PATHS.has(pathname);
}

export type AuthGuardResult =
  | { kind: "pass" }
  | { kind: "redirect"; location: string }
  | { kind: "unauthorized" };

export async function authGuard(
  req: Request,
  ip: string | null
): Promise<AuthGuardResult> {
  // env 開關:VP_DISABLE_AUTH=1 完全停用 TOTP 流程(loopback / 非 loopback 都直接過)。
  // 用途:臨時測試 / 內部信任網路;production 不要設
  if (process.env.VP_DISABLE_AUTH === "1") return { kind: "pass" };
  const url = new URL(req.url);
  if (isBypassPath(url.pathname)) return { kind: "pass" };
  if (isLoopback(ip)) return { kind: "pass" };

  const state = await readAuth();
  if (!state.totp_secret) {
    return { kind: "redirect", location: "/setup" };
  }

  const cookieValue = parseCookie(req.headers.get("cookie"), COOKIE_NAME);
  const session = findSession(cookieValue, state.sessions);
  if (!session) {
    return { kind: "redirect", location: "/login" };
  }

  session.lastActiveAt = Date.now();
  try {
    await writeAuth(state);
  } catch {}
  return { kind: "pass" };
}

export function guardResponse(result: AuthGuardResult, req: Request): Response | null {
  if (result.kind === "pass") return null;
  const accept = req.headers.get("accept") ?? "";
  const url = new URL(req.url);
  const wantsJson =
    url.pathname.startsWith("/api/") || accept.includes("application/json");
  if (result.kind === "redirect") {
    if (wantsJson) {
      return Response.json(
        { ok: false, error: { code: "auth_required", redirect: result.location } },
        { status: 401 }
      );
    }
    return new Response(null, {
      status: 302,
      headers: { Location: result.location },
    });
  }
  return Response.json(
    { ok: false, error: { code: "unauthorized", message: "Unauthorized" } },
    { status: 401 }
  );
}

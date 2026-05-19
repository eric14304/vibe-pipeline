import { createHash } from "node:crypto";
import type { Server } from "bun";
import { authenticateEnduser, authenticateMaster, getMasterToken } from "./lib/auth";
import { rateLimitCheck, tokenIssueRateLimitCheck } from "./lib/rateLimit";
import { registerDevice, sendToEnduser, unregisterDevice } from "./lib/fcm";
import { createEnduserToken, listTokens, revokeToken } from "./lib/tokens";
import type {
  AuthContext,
  AuthContextEnduser,
  AutoIssueTokenRequest,
  ErrorResponse,
  IssueTokenRequest,
  RegisterRequest,
  SendRequest,
  UnregisterRequest,
} from "./types";

const PORT = Number(process.env.PORT) || 8080;

function json(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
  });
}

function err(status: number, error: string, message?: string): Response {
  const body: ErrorResponse = message ? { error, message } : { error };
  return json(body, { status });
}

async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function isNonEmptyStr(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

async function requireMaster(req: Request): Promise<AuthContext | Response> {
  if (!getMasterToken()) return err(503, "master_token_unset", "MASTER_TOKEN env not configured");
  const ctx = await authenticateMaster(req);
  if (!ctx) return err(401, "unauthorized");
  return ctx;
}

async function requireEnduser(req: Request): Promise<AuthContextEnduser | Response> {
  const ctx = await authenticateEnduser(req);
  if (!ctx || ctx.kind !== "enduser") return err(401, "unauthorized");
  const rl = await rateLimitCheck(ctx.tokenSha.slice(0, 32));
  if (!rl.ok) {
    return json(
      { error: "rate_limited", limit: rl.limit, count: rl.count, resetAt: rl.resetAt },
      {
        status: 429,
        headers: {
          "x-ratelimit-limit": String(rl.limit),
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": String(rl.resetAt),
        },
      },
    );
  }
  return ctx;
}

function clientIp(req: Request, server: Server<unknown> | null): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  if (server) {
    const addr = server.requestIP(req);
    if (addr && addr.address) return addr.address;
  }
  return "unknown";
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function handle(req: Request, server: Server<unknown> | null): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (method === "GET" && path === "/health") return json({ ok: true });

  if (method === "POST" && path === "/tokens/auto-issue") {
    const ip = clientIp(req, server);
    const ipHash = sha256Hex(ip);
    const rl = await tokenIssueRateLimitCheck(ipHash);
    if (!rl.ok) {
      return json(
        { error: "rate_limited", limit: rl.limit, count: rl.count, resetAt: rl.resetAt },
        {
          status: 429,
          headers: {
            "x-ratelimit-limit": String(rl.limit),
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": String(rl.resetAt),
          },
        },
      );
    }
    const body = (await readJson<AutoIssueTokenRequest>(req)) ?? {};
    const rawLabel = isNonEmptyStr(body.label) ? body.label.trim() : "";
    const ipSuffix = ipHash.slice(-4);
    const label = rawLabel || `auto-${ipSuffix}`;
    const issued = await createEnduserToken(label);
    return json(issued);
  }

  if (method === "POST" && path === "/push/register") {
    const auth = await requireEnduser(req);
    if (auth instanceof Response) return auth;
    const body = await readJson<RegisterRequest>(req);
    if (!body || !isNonEmptyStr(body.deviceToken)) return err(400, "bad_request", "deviceToken required");
    const deviceId = await registerDevice(auth.tokenId, body.deviceToken, body.label);
    return json({ ok: true, deviceId });
  }

  if (method === "POST" && path === "/push/unregister") {
    const auth = await requireEnduser(req);
    if (auth instanceof Response) return auth;
    const body = await readJson<UnregisterRequest>(req);
    if (!body || !isNonEmptyStr(body.deviceToken)) return err(400, "bad_request", "deviceToken required");
    const removed = await unregisterDevice(auth.tokenId, body.deviceToken);
    return json({ ok: true, removed });
  }

  if (method === "POST" && path === "/push/send") {
    const auth = await requireEnduser(req);
    if (auth instanceof Response) return auth;
    const body = await readJson<SendRequest>(req);
    if (!body || !isNonEmptyStr(body.title) || !isNonEmptyStr(body.body)) {
      return err(400, "bad_request", "title and body required");
    }
    const result = await sendToEnduser(auth.tokenId, {
      title: body.title,
      body: body.body,
      data: body.data,
      ticketId: body.ticketId,
    });
    return json(result);
  }

  if (method === "POST" && path === "/admin/issue-token") {
    const auth = await requireMaster(req);
    if (auth instanceof Response) return auth;
    const body = await readJson<IssueTokenRequest>(req);
    if (!body || !isNonEmptyStr(body.label)) return err(400, "bad_request", "label required");
    const issued = await createEnduserToken(body.label);
    return json(issued);
  }

  const revokeMatch = /^\/admin\/revoke-token\/([A-Za-z0-9_-]+)$/.exec(path);
  if (method === "POST" && revokeMatch) {
    const auth = await requireMaster(req);
    if (auth instanceof Response) return auth;
    const tokenId = revokeMatch[1]!;
    const ok = await revokeToken(tokenId);
    if (!ok) return err(404, "not_found", "tokenId not found");
    return json({ ok: true, tokenId });
  }

  if (method === "GET" && path === "/admin/tokens") {
    const auth = await requireMaster(req);
    if (auth instanceof Response) return auth;
    const tokens = await listTokens();
    return json({ tokens });
  }

  return err(404, "not_found");
}

const server = Bun.serve({
  port: PORT,
  fetch: async (req, srv) => {
    try {
      return await handle(req, srv);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[gateway] handler error:", message);
      return err(500, "internal_error", message);
    }
  },
});

console.log(`[gateway] listening on :${server.port}`);

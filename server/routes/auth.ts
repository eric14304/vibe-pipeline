import { basename } from "node:path";
import { homedir } from "node:os";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode-svg";
import { readAuth, writeAuth, type AuthSession } from "../lib/auth/storage";
import {
  COOKIE_NAME,
  clearCookieHeader,
  findSession,
  generateCookieValue,
  parseCookie,
  setCookieHeader,
  sha256hex,
} from "../lib/auth/cookie";
import { consumeSetupToken, createSetupToken } from "../lib/auth/pending";

const ISSUER = "vibe-pipeline";

function accountLabel(): string {
  try {
    return basename(homedir()) || "user";
  } catch {
    return "user";
  }
}

function clientIp(req: Request): string {
  const ip = (req as unknown as { __ip?: string }).__ip;
  return ip ?? "unknown";
}

function userAgent(req: Request): string {
  return req.headers.get("user-agent") ?? "unknown";
}

function verifyTotp(secret: string, code: string): boolean {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6,8}$/.test(cleaned)) return false;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel(),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const delta = totp.validate({ token: cleaned, window: 1 });
  return delta !== null;
}

export async function setupInit(): Promise<Response> {
  const existing = await readAuth();
  if (existing.totp_secret) {
    return Response.json(
      { ok: false, error: { code: "already_bound", message: "TOTP already bound. Use /api/auth/reset first." } },
      { status: 409 }
    );
  }
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: accountLabel(),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const otpauth_url = totp.toString();
  const qr_svg = new QRCode({
    content: otpauth_url,
    padding: 2,
    width: 240,
    height: 240,
    join: true,
    container: "svg-viewbox",
  }).svg();
  const setup_token = createSetupToken(secret);
  return Response.json({ ok: true, data: { otpauth_url, qr_svg, setup_token } });
}

export async function setupVerify(req: Request): Promise<Response> {
  let body: { setup_token?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 }
    );
  }
  const token = typeof body.setup_token === "string" ? body.setup_token : "";
  const code = typeof body.code === "string" ? body.code : "";
  if (!token || !code) {
    return Response.json(
      { ok: false, error: { code: "bad_request", message: "Missing setup_token or code" } },
      { status: 400 }
    );
  }

  const existing = await readAuth();
  if (existing.totp_secret) {
    return Response.json(
      { ok: false, error: { code: "already_bound", message: "TOTP already bound" } },
      { status: 409 }
    );
  }

  const secret = consumeSetupToken(token);
  if (!secret) {
    return Response.json(
      { ok: false, error: { code: "setup_expired", message: "Setup token invalid or expired" } },
      { status: 400 }
    );
  }

  if (!verifyTotp(secret, code)) {
    return Response.json(
      { ok: false, error: { code: "invalid_code", message: "TOTP code did not verify" } },
      { status: 401 }
    );
  }

  const now = Date.now();
  const cookieValue = generateCookieValue();
  const session: AuthSession = {
    cookieHash: sha256hex(cookieValue),
    ip: clientIp(req),
    ua: userAgent(req),
    createdAt: now,
    lastActiveAt: now,
  };
  await writeAuth({
    totp_secret: secret,
    boundAt: now,
    sessions: [session],
  });
  return new Response(JSON.stringify({ ok: true, data: { bound: true } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setCookieHeader(cookieValue),
    },
  });
}

export async function login(req: Request): Promise<Response> {
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { ok: false, error: { code: "bad_request", message: "Invalid JSON" } },
      { status: 400 }
    );
  }
  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return Response.json(
      { ok: false, error: { code: "bad_request", message: "Missing code" } },
      { status: 400 }
    );
  }
  const state = await readAuth();
  if (!state.totp_secret) {
    return Response.json(
      { ok: false, error: { code: "not_bound", message: "TOTP not bound, call /api/auth/setup-init first" } },
      { status: 409 }
    );
  }
  if (!verifyTotp(state.totp_secret, code)) {
    return Response.json(
      { ok: false, error: { code: "invalid_code", message: "TOTP code did not verify" } },
      { status: 401 }
    );
  }
  const now = Date.now();
  const cookieValue = generateCookieValue();
  state.sessions.push({
    cookieHash: sha256hex(cookieValue),
    ip: clientIp(req),
    ua: userAgent(req),
    createdAt: now,
    lastActiveAt: now,
  });
  await writeAuth(state);
  return new Response(JSON.stringify({ ok: true, data: { authed: true } }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": setCookieHeader(cookieValue),
    },
  });
}

export async function logout(req: Request): Promise<Response> {
  const state = await readAuth();
  const cookieValue = parseCookie(req.headers.get("cookie"), COOKIE_NAME);
  if (cookieValue) {
    const hash = sha256hex(cookieValue);
    state.sessions = state.sessions.filter((s) => s.cookieHash !== hash);
    await writeAuth(state);
  }
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookieHeader() },
  });
}

export async function listSessions(): Promise<Response> {
  const state = await readAuth();
  const safe = state.sessions.map((s) => ({
    cookieHash: s.cookieHash,
    ip: s.ip,
    ua: s.ua,
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
  }));
  return Response.json({ ok: true, data: { sessions: safe } });
}

export async function deleteSession(cookieHash: string): Promise<Response> {
  const state = await readAuth();
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((s) => s.cookieHash !== cookieHash);
  if (state.sessions.length === before) {
    return Response.json(
      { ok: false, error: { code: "not_found", message: "Session not found" } },
      { status: 404 }
    );
  }
  await writeAuth(state);
  return new Response(null, { status: 204 });
}

export async function reset(req: Request): Promise<Response> {
  const state = await readAuth();
  const cookieValue = parseCookie(req.headers.get("cookie"), COOKIE_NAME);
  const session = findSession(cookieValue, state.sessions);
  if (!session) {
    return Response.json(
      { ok: false, error: { code: "unauthorized", message: "Valid session required" } },
      { status: 401 }
    );
  }
  await writeAuth({ totp_secret: null, boundAt: null, sessions: [] });
  return new Response(null, {
    status: 204,
    headers: { "Set-Cookie": clearCookieHeader() },
  });
}

export async function status(): Promise<Response> {
  const state = await readAuth();
  return Response.json({
    ok: true,
    data: {
      bound: Boolean(state.totp_secret),
      boundAt: state.boundAt ?? undefined,
    },
  });
}

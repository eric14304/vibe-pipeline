import type { IssueTokenResponse, ListTokensResponse, TokenSummary } from "./types";

const GATEWAY_URL = (process.env.GATEWAY_URL || "http://localhost:8080").replace(/\/+$/, "");
const MASTER_TOKEN = process.env.MASTER_TOKEN || "";

function usage(): string {
  return [
    "vp-gw-admin — vibe-pipeline FCM gateway admin CLI",
    "",
    "Usage:",
    "  bun run admin issue --label=<name>",
    "  bun run admin revoke <tokenId>",
    "  bun run admin list",
    "",
    "Env:",
    "  GATEWAY_URL   gateway base URL (default http://localhost:8080)",
    "  MASTER_TOKEN  required; matches gateway MASTER_TOKEN",
  ].join("\n");
}

function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

function parseLabel(args: string[]): string | null {
  for (const a of args) {
    if (a.startsWith("--label=")) return a.slice("--label=".length);
    if (a === "--label") {
      const i = args.indexOf(a);
      return args[i + 1] ?? null;
    }
  }
  return null;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${MASTER_TOKEN}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) die(`HTTP ${res.status} ${res.statusText}: ${text}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    die(`invalid JSON response: ${text}`);
  }
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function fmtTime(t: number | null): string {
  if (t == null) return "-";
  return new Date(t).toISOString().replace("T", " ").slice(0, 19);
}

function printTokens(rows: TokenSummary[]): void {
  const header = [pad("tokenId", 24), pad("label", 20), pad("createdAt", 20), pad("lastUsedAt", 20), "revoked"];
  console.log(header.join("  "));
  console.log("-".repeat(header.join("  ").length));
  for (const r of rows) {
    console.log(
      [
        pad(r.tokenId, 24),
        pad(r.label, 20),
        pad(fmtTime(r.createdAt), 20),
        pad(fmtTime(r.lastUsedAt), 20),
        r.revoked ? "yes" : "no",
      ].join("  "),
    );
  }
  console.log(`(${rows.length} tokens)`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cmd = argv[0];

  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
    console.log(usage());
    return;
  }

  if (cmd === "list" && (argv[1] === "--help" || argv[1] === "-h")) {
    console.log("vp-gw-admin list — print all enduser tokens (GET /admin/tokens)");
    return;
  }
  if (cmd === "issue" && argv.includes("--help")) {
    console.log("vp-gw-admin issue --label=<name> — issue new enduser token (POST /admin/issue-token)");
    return;
  }
  if (cmd === "revoke" && argv.includes("--help")) {
    console.log("vp-gw-admin revoke <tokenId> — revoke token (POST /admin/revoke-token/:tokenId)");
    return;
  }

  if (!MASTER_TOKEN) die("MASTER_TOKEN env not set; export MASTER_TOKEN=<value> before running");

  if (cmd === "issue") {
    const label = parseLabel(argv.slice(1));
    if (!label) die("issue: --label=<name> required");
    const r = await call<IssueTokenResponse>("POST", "/admin/issue-token", { label });
    console.log(JSON.stringify(r, null, 2));
    console.error("[admin] plaintext token shown ONCE — store it now; gateway only keeps sha256");
    return;
  }

  if (cmd === "revoke") {
    const tokenId = argv[1];
    if (!tokenId) die("revoke: <tokenId> required");
    const r = await call<{ ok: true; tokenId: string }>("POST", `/admin/revoke-token/${encodeURIComponent(tokenId)}`);
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  if (cmd === "list") {
    const r = await call<ListTokensResponse>("GET", "/admin/tokens");
    printTokens(r.tokens);
    return;
  }

  die(`unknown command: ${cmd}\n\n${usage()}`);
}

main().catch((e) => die(e instanceof Error ? e.stack || e.message : String(e)));

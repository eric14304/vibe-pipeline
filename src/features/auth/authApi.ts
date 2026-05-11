const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

export async function authedFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const url =
    typeof input === "string" && input.startsWith("/")
      ? `${API_BASE_URL}${input}`
      : input;
  const res = await fetch(url, { ...init, credentials: "include" });
  if (res.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login") && !window.location.pathname.startsWith("/setup")) {
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?returnTo=${returnTo}`;
    }
    return res;
  }
  return res;
}

export type SetupInitResp = { qr_svg: string; setup_token: string };

export async function setupInit(): Promise<SetupInitResp> {
  const res = await authedFetch("/api/auth/setup-init", { method: "POST" });
  if (!res.ok) throw new Error(`setup-init ${res.status}`);
  return (await res.json()) as SetupInitResp;
}

export async function setupVerify(setup_token: string, code: string): Promise<void> {
  const res = await authedFetch("/api/auth/setup-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ setup_token, code }),
  });
  if (!res.ok) throw new Error(`setup-verify ${res.status}`);
}

export async function login(code: string): Promise<void> {
  const res = await authedFetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`login ${res.status}`);
}

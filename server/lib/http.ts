import type { ApiResponse, ApiErrorCode } from "../../shared/types";

export function ok<T>(data: T): Response {
  return Response.json({ ok: true, data } satisfies ApiResponse<T>);
}

export function err(code: ApiErrorCode, message: string, status = 400): Response {
  return Response.json({ ok: false, error: { code, message } } satisfies ApiResponse<never>, {
    status,
  });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return (await req.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

// Guard:吃 JSON body 的寫入端點要求 content-type: application/json; charset=utf-8
// 防 shell 端 caller 沒指定 charset 導致中文寫入 pipeline.json 變亂碼。
// 通過回 null;失敗回 400 Response。
//
// 規則(case-insensitive):
//   - 主類型必須是 application/json
//   - 必須有 charset 參數且值為 utf-8
//   - 允許 parameter 順序任意 + 大小寫 + 寬鬆空白
export function requireJsonUtf8(req: Request): Response | null {
  const raw = req.headers.get("content-type") ?? "";
  if (!isJsonUtf8(raw)) {
    return err(
      "invalid_path",
      "content-type must be application/json; charset=utf-8",
      400
    );
  }
  return null;
}

export function isJsonUtf8(contentType: string): boolean {
  if (!contentType) return false;
  const parts = contentType.split(";").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  const mime = parts[0].toLowerCase();
  if (mime !== "application/json") return false;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    const eq = p.indexOf("=");
    if (eq < 0) continue;
    const k = p.slice(0, eq).trim().toLowerCase();
    if (k !== "charset") continue;
    let v = p.slice(eq + 1).trim().toLowerCase();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
      v = v.slice(1, -1);
    }
    return v === "utf-8";
  }
  return false;
}

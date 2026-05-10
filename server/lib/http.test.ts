import { describe, expect, test } from "bun:test";
import { isJsonUtf8, requireJsonUtf8 } from "./http";

describe("isJsonUtf8", () => {
  test("standard application/json; charset=utf-8 → true", () => {
    expect(isJsonUtf8("application/json; charset=utf-8")).toBe(true);
  });
  test("uppercase UTF-8 → true", () => {
    expect(isJsonUtf8("application/json; charset=UTF-8")).toBe(true);
  });
  test("MIXED case mime → true", () => {
    expect(isJsonUtf8("Application/JSON; Charset=utf-8")).toBe(true);
  });
  test("loose whitespace → true", () => {
    expect(isJsonUtf8("application/json ;  charset = utf-8")).toBe(true);
  });
  test("quoted charset value → true", () => {
    expect(isJsonUtf8('application/json; charset="utf-8"')).toBe(true);
  });
  test("application/json without charset → false", () => {
    expect(isJsonUtf8("application/json")).toBe(false);
  });
  test("application/json; charset=cp950 → false", () => {
    expect(isJsonUtf8("application/json; charset=cp950")).toBe(false);
  });
  test("application/json; charset=big5 → false", () => {
    expect(isJsonUtf8("application/json; charset=big5")).toBe(false);
  });
  test("text/plain; charset=utf-8 → false (wrong mime)", () => {
    expect(isJsonUtf8("text/plain; charset=utf-8")).toBe(false);
  });
  test("application/x-www-form-urlencoded → false", () => {
    expect(isJsonUtf8("application/x-www-form-urlencoded")).toBe(false);
  });
  test("empty string → false", () => {
    expect(isJsonUtf8("")).toBe(false);
  });
  test("application/json+ld → false (not exactly json)", () => {
    expect(isJsonUtf8("application/json+ld; charset=utf-8")).toBe(false);
  });
});

function makeReq(contentType: string | null): Request {
  const headers: Record<string, string> = {};
  if (contentType !== null) headers["content-type"] = contentType;
  return new Request("http://localhost/x", {
    method: "POST",
    body: '{"a":1}',
    headers,
  });
}

describe("requireJsonUtf8", () => {
  test("application/json; charset=utf-8 → null (pass)", () => {
    expect(requireJsonUtf8(makeReq("application/json; charset=utf-8"))).toBeNull();
  });
  test("application/json (no charset) → 400 with明確訊息", async () => {
    const res = requireJsonUtf8(makeReq("application/json"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
    const body = (await res!.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.message).toBe(
      "content-type must be application/json; charset=utf-8"
    );
  });
  test("application/json; charset=cp950 → 400", () => {
    const res = requireJsonUtf8(makeReq("application/json; charset=cp950"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });
  test("missing content-type header → 400", () => {
    const res = requireJsonUtf8(makeReq(null));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });
  test("text/plain; charset=utf-8 → 400 (wrong mime even if charset right)", () => {
    const res = requireJsonUtf8(makeReq("text/plain; charset=utf-8"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(400);
  });
});

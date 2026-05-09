// 前後端共用持久化型別。Backend 是 source of truth。

export type Project = {
  path: string; // absolute
  hash: string; // sha256(path).slice(0, 8)
  name: string; // basename(path)
  hasTickets: boolean; // .tickets/ 是否存在
  lastOpenedAt: number; // unix ms
};

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: { code: ApiErrorCode; message: string } };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

export type ApiErrorCode =
  | "not_found"
  | "permission_denied"
  | "dialog_cancelled"
  | "invalid_path"
  | "tickets_not_initialized"
  | "already_initialized"
  | "internal_error";

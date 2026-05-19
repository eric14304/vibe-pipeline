export interface RegisterRequest {
  deviceToken: string;
  label?: string;
}

export interface RegisterResponse {
  ok: true;
  deviceId: string;
}

export interface UnregisterRequest {
  deviceToken: string;
}

export interface UnregisterResponse {
  ok: true;
  removed: number;
}

export interface SendRequest {
  title: string;
  body: string;
  data?: Record<string, string>;
  ticketId?: string;
}

export interface SendFailure {
  deviceId: string;
  deviceToken: string;
  error: string;
  code?: string;
}

export interface SendResponse {
  sent: number;
  failed: SendFailure[];
}

export interface IssueTokenRequest {
  label: string;
}

export interface AutoIssueTokenRequest {
  label?: string;
}

export interface IssueTokenResponse {
  tokenId: string;
  token: string;
}

export interface TokenSummary {
  tokenId: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  revoked: boolean;
}

export interface ListTokensResponse {
  tokens: TokenSummary[];
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

export interface AuthContextEnduser {
  kind: "enduser";
  tokenId: string;
  tokenSha: string;
}

export interface AuthContextMaster {
  kind: "master";
}

export type AuthContext = AuthContextEnduser | AuthContextMaster;

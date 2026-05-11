export type AuthStatus = {
  bound: boolean;
  boundAt?: number;
};

export type SessionInfo = {
  cookieHash: string;
  ip: string;
  ua: string;
  createdAt: number;
  lastActiveAt: number;
};

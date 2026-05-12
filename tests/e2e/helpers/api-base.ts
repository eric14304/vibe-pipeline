const BACKEND_PORT = process.env.E2E_BACKEND_PORT ?? process.env.PORT ?? "3001";

export const API_ORIGIN = `http://127.0.0.1:${BACKEND_PORT}`;
export const API_BASE = `${API_ORIGIN}/api`;
export const TEST_API_BASE = `${API_BASE}/__test`;

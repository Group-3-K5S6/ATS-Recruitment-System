const API_BASE = "/api";
const REFRESH_BEFORE_EXPIRY_MS = 60_000;

let proactiveRefreshTimer: number | undefined;
let refreshInFlight: Promise<boolean> | null = null;
let visibilityListenerInstalled = false;

export type ApiUser = {
  id: string;
  email: string;
  fullName: string;
  departmentId: string | null;
  roles: string[];
  permissions: string[];
};

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string; error?: { code?: string; message?: string } };

function getTokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const normalized = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = JSON.parse(window.atob(normalized)) as { exp?: unknown };
    return typeof decoded.exp === "number" ? decoded.exp * 1000 : null;
  } catch {
    return null;
  }
}

function expireSession() {
  if (proactiveRefreshTimer !== undefined) window.clearTimeout(proactiveRefreshTimer);
  proactiveRefreshTimer = undefined;
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("currentUser");
  window.dispatchEvent(new Event("ats:session-expired"));
}

function scheduleProactiveRefresh() {
  if (proactiveRefreshTimer !== undefined) window.clearTimeout(proactiveRefreshTimer);
  proactiveRefreshTimer = undefined;

  const accessToken = sessionStorage.getItem("accessToken");
  if (!accessToken || !sessionStorage.getItem("refreshToken")) return;

  const expiresAt = getTokenExpiry(accessToken);
  if (expiresAt === null) return;

  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BEFORE_EXPIRY_MS);
  proactiveRefreshTimer = window.setTimeout(async () => {
    proactiveRefreshTimer = undefined;
    if (!sessionStorage.getItem("accessToken") || !sessionStorage.getItem("refreshToken")) return;
    if (!(await refreshAccessToken())) expireSession();
  }, delay);

  if (!visibilityListenerInstalled) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") scheduleProactiveRefresh();
    });
    visibilityListenerInstalled = true;
  }
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = refreshAccessTokenOnce().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshAccessTokenOnce(): Promise<boolean> {
  const refreshToken = sessionStorage.getItem("refreshToken");
  if (!refreshToken) return false;
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }),
    });
    const envelope = await response.json() as ApiEnvelope<{ accessToken: string; refreshToken: string }>;
    if (!response.ok || !envelope.data) return false;
    sessionStorage.setItem("accessToken", envelope.data.accessToken);
    sessionStorage.setItem("refreshToken", envelope.data.refreshToken);
    scheduleProactiveRefresh();
    return true;
  } catch { return false; }
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const accessToken = sessionStorage.getItem("accessToken");
  if (accessToken) scheduleProactiveRefresh();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const publicAuthRoute = ["/auth/login", "/auth/refresh", "/auth/forgot-password", "/auth/verify-reset-code", "/auth/reset-password"].includes(path);
  if (response.status === 401 && retry && !publicAuthRoute) {
    if (await refreshAccessToken()) {
      let retryOptions = options;
      if (path === "/auth/logout" && typeof options.body === "string") {
        try {
          const body = JSON.parse(options.body) as Record<string, unknown>;
          retryOptions = { ...options, body: JSON.stringify({ ...body, refreshToken: sessionStorage.getItem("refreshToken") }) };
        } catch { /* Keep the original request body when it is not JSON. */ }
      }
      return apiRequest<T>(path, retryOptions, false);
    }
    expireSession();
  }
  const envelope = await response.json().catch(() => ({})) as ApiEnvelope<T>;
  if (!response.ok || envelope.success === false) throw new ApiError(envelope.error?.message ?? envelope.message ?? "Không thể kết nối tới máy chủ.", response.status, envelope.error?.code);
  return envelope.data as T;
}

export async function login(email: string, password: string) {
  const result = await apiRequest<{ accessToken: string; refreshToken: string; user: ApiUser }>("/auth/login", {
    method: "POST", body: JSON.stringify({ email, password }),
  }, false);
  sessionStorage.setItem("accessToken", result.accessToken);
  sessionStorage.setItem("refreshToken", result.refreshToken);
  sessionStorage.setItem("currentUser", JSON.stringify(result.user));
  scheduleProactiveRefresh();
  return result.user;
}

export function getCurrentUser(): ApiUser | null {
  try { return JSON.parse(sessionStorage.getItem("currentUser") ?? "null") as ApiUser | null; }
  catch { return null; }
}

export async function restoreCurrentUser() {
  const user = await apiRequest<ApiUser>("/auth/me");
  sessionStorage.setItem("currentUser", JSON.stringify(user));
  return user;
}

export function clearAuthState() {
  sessionStorage.removeItem("accessToken");
  sessionStorage.removeItem("refreshToken");
  sessionStorage.removeItem("currentUser");
}

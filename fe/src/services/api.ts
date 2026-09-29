import { clearLocalSession, markSessionExpired } from "./session";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "/api";

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  requestId?: string;
  action?: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly details: ApiErrorPayload;

  constructor(
    status: number,
    details: ApiErrorPayload,
  ) {
    super(details.message ?? "Không thể xử lý yêu cầu.");
    this.status = status;
    this.details = details;
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = sessionStorage.getItem("accessToken");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, { code: "API_UNAVAILABLE", message: "Không thể kết nối máy chủ. Vui lòng thử lại." });
  }

  const body = await response.json().catch(() => null) as {
    data?: T;
    error?: ApiErrorPayload;
  } | null;
  if (!response.ok) {
    throw new ApiError(response.status, body?.error ?? { message: "Yêu cầu không thành công." });
  }
  return body?.data as T;
}

export function navigateForApiError(error: unknown, navigate: (path: string) => void) {
  if (!(error instanceof ApiError)) return false;
  if (error.status === 401) {
    clearLocalSession();
    markSessionExpired();
    navigate("/login");
    return true;
  }
  if (error.status === 403) navigate("/403");
  else if (error.status === 404) navigate("/404");
  else if (error.status >= 500) navigate("/500");
  else return false;
  return true;
}

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
};

export type LoginResult = { accessToken: string; refreshToken: string; user: AuthUser };

export function login(email: string, password: string) {
  return apiRequest<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function logout() {
  try {
    await apiRequest("/auth/logout", { method: "POST" });
  } finally {
    clearLocalSession();
  }
}

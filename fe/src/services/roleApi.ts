const ROLE_API_URL =
  import.meta.env.VITE_ROLE_API_URL || "http://localhost:4001";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

export type RoleUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  department: string;
  roles: string[];
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem("accessToken");
  if (!token) throw new Error("Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.");

  const response = await fetch(`${ROLE_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const result = (await response.json()) as ApiResponse<T>;
  if (!response.ok || !result.success || result.data === undefined) {
    throw new Error(result.error?.message || "Không thể kết nối API quản lý vai trò.");
  }
  return result.data;
}

export function loadRoleUsers() {
  return request<RoleUser[]>("/api/role-management/users");
}

export function loadAvailableRoles() {
  return request<string[]>("/api/role-management/roles");
}

export function assignRole(userId: string, role: string) {
  return request<{ userId: string; role: string }>(
    `/api/role-management/users/${encodeURIComponent(userId)}/roles`,
    { method: "POST", body: JSON.stringify({ role }) },
  );
}

export function revokeRole(userId: string, role: string) {
  return request<{ userId: string; role: string }>(
    `/api/role-management/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(role)}`,
    { method: "DELETE" },
  );
}

export async function login(email: string, password: string) {
  const baseUrl = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const result = (await response.json()) as ApiResponse<{
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; fullName: string; roles: string[] };
  }>;
  if (!response.ok || !result.success || !result.data) {
    throw new Error(result.error?.message || "Email hoặc mật khẩu không chính xác.");
  }
  return result.data;
}

export async function logout(token: string) {
  const baseUrl = import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";
  await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
}

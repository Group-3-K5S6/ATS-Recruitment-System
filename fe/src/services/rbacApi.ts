const API_URL =
  import.meta.env.VITE_ATS_API_URL ||
  "http://localhost:4000";

export type Permission = {
  id: string;
  code: string;
  module: string;
  description: string;
};

export type RoleWithPermissions = {
  id: string;
  name: string;
  description: string;
  isSystemAdmin: boolean;
  permissions: Permission[];
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
  message?: string;
};

function getToken(): string {
  const token =
    sessionStorage.getItem("accessToken");

  if (!token) {
    throw new Error(
      "Phiên đăng nhập không tồn tại.",
    );
  }

  return token;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const response = await fetch(
    `${API_URL}${path}`,
    {
      ...init,

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    },
  );

  const result =
    (await response.json()) as ApiResponse<T>;

  if (
    !response.ok ||
    !result.success ||
    result.data === undefined
  ) {
    throw new Error(
      result.error?.message ||
        "Không thể thực hiện yêu cầu.",
    );
  }

  return result.data;
}

export function getRoles() {
  return request<RoleWithPermissions[]>(
    "/api/rbac/roles",
  );
}

export function getPermissions() {
  return request<Permission[]>(
    "/api/rbac/permissions",
  );
}

export function createPermission(payload: {
  code: string;
  module: string;
  description: string;
}) {
  return request<Permission>(
    "/api/rbac/permissions",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function updateRolePermissions(
  roleId: string,
  permissionIds: string[],
) {
  return request<RoleWithPermissions>(
    `/api/rbac/roles/${roleId}/permissions`,
    {
      method: "PUT",

      body: JSON.stringify({
        permissionIds,
      }),
    },
  );
}
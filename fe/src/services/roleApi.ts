const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

type BackendDepartment = {
  id?: string;
  name?: string;
};

type BackendUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  departmentId?: string | null;
  department?: BackendDepartment | null;
  roles: string[];
};

export type RoleUser = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  department: string;
  roles: string[];
};

/*
 * 7 vai trò đúng theo hệ thống.
 * Giá trị phải trùng RoleType ở Backend.
 */
const AVAILABLE_ROLES = [
  "CANDIDATE",
  "RECRUITER",
  "HIRING_MANAGER",
  "INTERVIEWER",
  "HR_MANAGER",
  "APPROVER",
  "ADMIN",
];

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const token = sessionStorage.getItem("accessToken");

  if (!token) {
    throw new Error(
      "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại."
    );
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });

  let result: ApiResponse<T>;

  try {
    result = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new Error("Phản hồi từ máy chủ không hợp lệ.");
  }

  if (
    !response.ok ||
    !result.success ||
    result.data === undefined
  ) {
    throw new Error(
      result.error?.message ||
        "Không thể kết nối API quản lý vai trò."
    );
  }

  return result.data;
}

/*
 * S1-09
 * Lấy danh sách tài khoản từ Backend chính.
 *
 * Backend:
 * GET /api/users
 */
export async function loadRoleUsers(): Promise<RoleUser[]> {
  const users = await request<BackendUser[]>("/api/users");

  return users.map((user) => ({
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    isActive: user.isActive,

    department:
      user.department?.name ||
      user.departmentId ||
      "Chưa có phòng ban",

    roles: user.roles || [],
  }));
}

/*
 * Backend hiện chưa có API riêng:
 * GET /api/roles
 *
 * Vì hệ thống có đúng 7 RoleType cố định,
 * FE dùng danh sách tương ứng với Backend.
 */
export async function loadAvailableRoles(): Promise<string[]> {
  return [...AVAILABLE_ROLES];
}

/*
 * Lấy tài khoản hiện tại trước khi cập nhật role.
 *
 * Backend PUT /api/users/:id/roles sử dụng toàn bộ
 * danh sách role mới chứ không thêm từng role riêng.
 */
async function getRoleUser(userId: string): Promise<RoleUser> {
  const users = await loadRoleUsers();

  const user = users.find((item) => item.id === userId);

  if (!user) {
    throw new Error("Không tìm thấy tài khoản cần cập nhật.");
  }

  return user;
}

/*
 * S1-09 - GÁN VAI TRÒ
 *
 * Ví dụ:
 * roles cũ:
 * ["HIRING_MANAGER"]
 *
 * gán thêm INTERVIEWER:
 * ["HIRING_MANAGER", "INTERVIEWER"]
 *
 * Backend:
 * PUT /api/users/:id/roles
 */
export async function assignRole(
  userId: string,
  role: string
) {
  const user = await getRoleUser(userId);

  const newRoles = Array.from(
    new Set([...user.roles, role])
  );

  const result = await request<{
    message: string;
    roles: string[];
  }>(
    `/api/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "PUT",
      body: JSON.stringify({
        roles: newRoles,
      }),
    }
  );

  return {
    userId,
    role,
    roles: result.roles,
  };
}

/*
 * S1-09 - THU HỒI VAI TRÒ
 *
 * Backend yêu cầu người dùng phải còn ít nhất
 * một vai trò nên không cho xóa role cuối cùng.
 */
export async function revokeRole(
  userId: string,
  role: string
) {
  const user = await getRoleUser(userId);

  const newRoles = user.roles.filter(
    (currentRole) => currentRole !== role
  );

  if (newRoles.length === 0) {
    throw new Error(
      "Người dùng phải có ít nhất một vai trò."
    );
  }

  const result = await request<{
    message: string;
    roles: string[];
  }>(
    `/api/users/${encodeURIComponent(userId)}/roles`,
    {
      method: "PUT",
      body: JSON.stringify({
        roles: newRoles,
      }),
    }
  );

  return {
    userId,
    role,
    roles: result.roles,
  };
}
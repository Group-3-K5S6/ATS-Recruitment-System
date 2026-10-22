const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

export type Department = {
  id: string;
  name: string;
  code: string;

  parentId: string | null;

  managerId: string | null;
  manager: string;

  active: boolean;
  isActive: boolean;

  hasOpenRequisition: boolean;

  children: Department[];
};

export type DepartmentUser = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  roles: string[];
};

export type DepartmentInput = {
  name: string;
  code: string;
  managerId: string;
  parentId: string | null;
};

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = sessionStorage.getItem("accessToken");

  if (!token) {
    throw new Error(
      "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.",
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
    throw new Error(
      "Phản hồi từ máy chủ không hợp lệ.",
    );
  }

  if (
    !response.ok ||
    !result.success ||
    result.data === undefined
  ) {
    throw new Error(
      result.error?.message ||
        "Không thể kết nối API phòng ban.",
    );
  }

  return result.data;
}

export function loadDepartments(): Promise<
  Department[]
> {
  return request<Department[]>(
    "/api/departments",
  );
}

export function loadDepartmentUsers(): Promise<
  DepartmentUser[]
> {
  return request<DepartmentUser[]>(
    "/api/users",
  );
}

export function createDepartment(
  input: DepartmentInput,
): Promise<Department> {
  return request<Department>(
    "/api/departments",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateDepartment(
  id: string,
  input: DepartmentInput,
): Promise<Department> {
  return request<Department>(
    `/api/departments/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(input),
    },
  );
}

export function setDepartmentActive(
  id: string,
  isActive: boolean,
): Promise<unknown> {
  return request(
    `/api/departments/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      body: JSON.stringify({
        isActive,
      }),
    },
  );
}

export function deleteDepartment(
  id: string,
): Promise<unknown> {
  return request(
    `/api/departments/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
}
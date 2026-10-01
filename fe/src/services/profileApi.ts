const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
  };
};

export type UserProfile = {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  departmentId?: string;
  department?: { id: string; name: string };
  roles: string[];
};

export type UpdateProfilePayload = {
  fullName?: string;
  phone?: string;
  avatarUrl?: string;
};

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
        "Không thể kết nối API."
    );
  }

  return result.data;
}

export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>("/api/users/me");
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<UserProfile> {
  return request<UserProfile>("/api/users/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

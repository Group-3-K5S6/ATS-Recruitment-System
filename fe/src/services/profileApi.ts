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
  phone?: string | null;
  jobTitle?: string | null;
  departmentId?: string | null;
  department?: {
    id: string;
    name: string;
  } | null;
  roles: string[];
};

export type UpdateProfilePayload = {
  fullName?: string;
  phone?: string;
  jobTitle?: string;
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

  const result = (await response.json()) as ApiResponse<T>;

  if (
    !response.ok ||
    !result.success ||
    result.data === undefined
  ) {
    throw new Error(
      result.error?.message ||
        "Không thể xử lý yêu cầu.",
    );
  }

  return result.data;
}

export async function getProfile(): Promise<UserProfile> {
  return request<UserProfile>("/api/users/me");
}

export async function updateProfile(
  payload: UpdateProfilePayload,
): Promise<UserProfile> {
  return request<UserProfile>("/api/users/me", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
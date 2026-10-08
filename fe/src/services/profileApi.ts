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
export type UploadAvatarResult = {
  hasAvatar: boolean;
};

function getAccessToken(): string {
  const token = sessionStorage.getItem("accessToken");

  if (!token) {
    throw new Error(
      "Phiên đăng nhập không còn hiệu lực. Vui lòng đăng nhập lại.",
    );
  }

  return token;
}

// S2-03 - Tải ảnh đại diện lên
export async function uploadAvatar(
  file: File,
): Promise<UploadAvatarResult> {
  const token = getAccessToken();

  const formData = new FormData();
  formData.append("avatar", file);

  const response = await fetch(
    `${API_URL}/api/users/me/avatar`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    },
  );

  const result =
    (await response.json()) as ApiResponse<UploadAvatarResult>;

  if (
    !response.ok ||
    !result.success ||
    result.data === undefined
  ) {
    throw new Error(
      result.error?.message ||
        "Không thể cập nhật ảnh đại diện.",
    );
  }

  return result.data;
}

// S2-03 - Lấy ảnh đại diện dạng thumbnail
export async function getAvatarObjectUrl(): Promise<
  string | null
> {
  const token = getAccessToken();

  const response = await fetch(
  `${API_URL}/api/users/me/avatar?size=thumbnail`,
  {
    method: "GET",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache",
    },
  },
);

  // Chưa có avatar thì dùng chữ viết tắt như giao diện hiện tại
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      "Không thể tải ảnh đại diện.",
    );
  }

  const blob = await response.blob();

  return URL.createObjectURL(blob);
}

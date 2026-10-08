const API_URL =
  import.meta.env.VITE_ATS_API_URL || "http://localhost:4000";

export type JobTitle = {
  id: string;
  code: string;
  name: string;
  level: string;
  minSalary: number;
  maxSalary: number;
};

export type JobTitlePayload = {
  code: string;
  name: string;
  level: string;
  minSalary: number;
  maxSalary: number;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    message?: string;
    code?: string;
  };
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
      result.error?.message || "Không thể xử lý yêu cầu.",
    );
  }

  return result.data;
}

export function getJobTitles(): Promise<JobTitle[]> {
  return request<JobTitle[]>("/api/job-titles");
}

export function createJobTitle(
  payload: JobTitlePayload,
): Promise<JobTitle> {
  return request<JobTitle>("/api/job-titles", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateJobTitle(
  id: string,
  payload: JobTitlePayload,
): Promise<JobTitle> {
  return request<JobTitle>(`/api/job-titles/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteJobTitle(
  id: string,
): Promise<{ id: string }> {
  return request<{ id: string }>(
    `/api/job-titles/${id}`,
    {
      method: "DELETE",
    },
  );
}
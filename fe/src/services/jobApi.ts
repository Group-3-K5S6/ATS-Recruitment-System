const API_URL = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';

export type JobDepartment = {
  id: string;
  name: string;
  code: string;
};

export type JobRequisition = {
  id: string;
  title: string;
  status: string;
  proposedSalaryMin?: number | null;
  proposedSalaryMax?: number | null;
  requirements?: string | null;
  targetDate?: string | null;
  description?: string | null;
};

export type CompanyProfile = {
  id?: string;
  companyName: string;
  tagline?: string;
  introduction?: string;
  culture?: string;
  benefits?: string;
  website?: string;
  contactEmail?: string;
  location?: string;
  logoData?: string | null;
  bannerData?: string | null;
};

export type JobSalary = {
  showSalary: boolean;
  min?: number | null;
  max?: number | null;
  displayText: string;
};

export type JobDetail = {
  id: string;
  title: string;
  description: string;
  location: string;
  workMode: 'ONSITE' | 'HYBRID' | 'REMOTE' | string;
  applicationDeadline?: string | null;
  showSalary: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  department?: JobDepartment | null;
  requisition?: JobRequisition | null;
  salary?: JobSalary;
  companyProfile?: CompanyProfile;
  companyName?: string;
  isExpired?: boolean;
};

export type ApplyPayload = {
  fullName: string;
  email: string;
  phone?: string;
  cvUrl?: string;
  address?: string;
  expectedSalary?: number;
  currentCompany?: string;
  coverNote?: string;
};

export type ApplyResult = {
  applicationId?: string;
  candidateId?: string;
  fullName?: string;
  email?: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = sessionStorage.getItem('accessToken');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error('Không thể kết nối đến máy chủ Backend. Vui lòng kiểm tra cổng 4000.');
  }

  const payload: ApiResponse<T> = await res.json().catch(() => ({
    success: false,
    error: { message: `Lỗi phản hồi từ máy chủ HTTP ${res.status}` },
  }));

  if (!res.ok || !payload.success || payload.data === undefined) {
    if (payload.error?.code === 'JOB_EXPIRED') {
      throw new Error('Tin tuyển dụng này đã hết hạn nhận hồ sơ.');
    }
    throw new Error(payload.error?.message || `Yêu cầu thất bại (mã ${res.status})`);
  }

  return payload.data;
}

export async function getPublicJobs(): Promise<JobDetail[]> {
  return apiRequest<JobDetail[]>('/api/jobs/public');
}

export async function getJobDetail(id: string): Promise<JobDetail> {
  const token = sessionStorage.getItem('accessToken');
  // First try /api/jobs/:id if token exists, fallback to /api/jobs/public/:id
  if (token) {
    try {
      return await apiRequest<JobDetail>(`/api/jobs/${encodeURIComponent(id)}`);
    } catch {
      return await apiRequest<JobDetail>(`/api/jobs/public/${encodeURIComponent(id)}`);
    }
  }
  return apiRequest<JobDetail>(`/api/jobs/public/${encodeURIComponent(id)}`);
}

export async function applyForJob(jobId: string, payload: ApplyPayload): Promise<ApplyResult> {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    return apiRequest<ApplyResult>('/api/candidates', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        jobId,
      }),
    });
  }
  return apiRequest<ApplyResult>(`/api/jobs/public/${encodeURIComponent(jobId)}/apply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

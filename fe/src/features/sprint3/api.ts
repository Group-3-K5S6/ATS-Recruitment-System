export const API_URL = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';

type Envelope<T> = { success: boolean; data?: T; error?: { code?: string; message?: string } };

export async function atsApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = sessionStorage.getItem('accessToken');
  if (!token) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new Error('Không kết nối được Backend. Hãy kiểm tra máy chủ cổng 4000.');
  }
  const result: Envelope<T> | null = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true || result.data === undefined) {
    if (response.status === 404) throw new Error(`Backend chưa cung cấp API ${method} ${path}, cần BE hoàn thiện trước khi nghiệm thu.`);
    if (response.status === 403) throw new Error('Tài khoản hiện tại không được cấp quyền thực hiện thao tác này.');
    throw new Error(result?.error?.message || `Máy chủ trả về lỗi HTTP ${response.status}.`);
  }
  return result.data;
}

export type Department = { id: string; name: string; isActive?: boolean; children?: Department[] };
export type Requisition = {
  id: string; title: string; status: string; departmentId: string; hiringManagerId: string;
  jobTitleId?: string | null; headcount?: number; reason?: 'NEW' | 'REPLACEMENT' | null;
  proposedSalaryMin?: number | null; proposedSalaryMax?: number | null;
  targetDate?: string | null; description?: string | null; requirements?: string | null;
  salaryExplanation?: string | null; department?: { name: string } | null;
};
export function flatDepartments(items: Department[], level = 0): Department[] {
  return items.flatMap(({ children, ...item }) => [
    { ...item, name: `${'— '.repeat(level)}${item.name}` },
    ...flatDepartments(children || [], level + 1),
  ]);
}
export function fromError(error: unknown): string {
  return error instanceof Error ? error.message : 'Có lỗi không xác định xảy ra.';
}

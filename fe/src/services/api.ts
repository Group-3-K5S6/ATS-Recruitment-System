type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: { message?: string };
};

export async function readApiResponse<T>(response: Response): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`Máy chủ không trả dữ liệu (HTTP ${response.status}). Hãy kiểm tra backend.`);
  }

  let result: ApiEnvelope<T>;
  try {
    result = JSON.parse(body) as ApiEnvelope<T>;
  } catch {
    throw new Error(`Máy chủ trả phản hồi không hợp lệ (HTTP ${response.status}). Hãy kiểm tra backend/proxy.`);
  }

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message ?? `Yêu cầu thất bại (HTTP ${response.status}).`);
  }
  if (result.data === undefined) {
    throw new Error('Máy chủ không trả dữ liệu cần thiết.');
  }
  return result.data;
}

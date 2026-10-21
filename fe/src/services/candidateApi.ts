const API_URL = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';

export type CandidateApplication = {
  id: string;
  jobId: string;
  stage: string;
  status: string;
  createdAt: string;
  assignedRecruiterId?: string | null;
  job?: {
    id: string;
    title: string;
    departmentId: string;
    hiringManagerId: string;
  } | null;
};

export type CandidateRecord = {
  id: string;
  fullName: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  currentCompany?: string | null;
  cvUrl?: string | null;
  applications?: CandidateApplication[];
};

export type CandidateCvResult = {
  cvUrl: string;
};

export class CandidateApiError extends Error {
  public readonly kind: 'unauthorized' | 'forbidden' | 'notFound' | 'network' | 'server';

  constructor(kind: 'unauthorized' | 'forbidden' | 'notFound' | 'network' | 'server') {
    super(kind);
    this.name = 'CandidateApiError';
    this.kind = kind;
  }
}

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
};

async function get<T>(path: string, signal: AbortSignal): Promise<T> {
  const token = sessionStorage.getItem('accessToken');
  if (!token) throw new CandidateApiError('unauthorized');

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: 'GET',
      signal,
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new CandidateApiError('network');
  }

  if (response.status === 401) throw new CandidateApiError('unauthorized');
  if (response.status === 403) throw new CandidateApiError('forbidden');
  if (response.status === 404) throw new CandidateApiError('notFound');
  if (!response.ok) throw new CandidateApiError('server');

  let envelope: ApiEnvelope<T>;
  try {
    envelope = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new CandidateApiError('server');
  }
  if (envelope.success !== true || envelope.data === undefined) {
    throw new CandidateApiError('server');
  }
  return envelope.data;
}

export function getCandidate(id: string, signal: AbortSignal): Promise<CandidateRecord> {
  return get<CandidateRecord>(`/api/candidates/${encodeURIComponent(id)}`, signal);
}

export function getCandidateCv(id: string, signal: AbortSignal): Promise<CandidateCvResult> {
  return get<CandidateCvResult>(`/api/candidates/${encodeURIComponent(id)}/cv`, signal);
}

export function getCandidateCvApiOrigin(): string {
  return new URL(API_URL).origin;
}

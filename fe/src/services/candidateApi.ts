const API_URL = import.meta.env.VITE_ATS_API_URL || 'http://localhost:4000';

export type CandidateApplication = {
  id: string;
  jobId: string;
  stage: string;
  status: string;
  createdAt: string;
  assignedRecruiterId?: string | null;
  interviews?: Array<{
    id: string;
    scheduledAt: string;
    status: string;
    interviewer?: { fullName: string } | null;
    evaluations?: Array<{
      id: string;
      score: number;
      recommendation?: string | null;
    }>;
  }>;
  offers?: Array<{
    id: string;
    status: string;
  }>;
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
  labels?: string | null;
  notes?: string | null;
  applications?: CandidateApplication[];
};

export type CandidateDirectoryEntry = {
  id: string;
  fullName: string;
  applications: Array<{
    id: string;
    jobId: string;
    job: { id: string; title: string; status: string } | null;
  }>;
};

export type HiringManagerJob = {
  id: string;
  title: string;
  status: string;
  candidateCount?: number;
  department?: { name: string } | null;
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

export function getCandidateDirectory(signal: AbortSignal): Promise<CandidateDirectoryEntry[]> {
  return get<CandidateDirectoryEntry[]>('/api/candidates/profiles', signal);
}

export function getHiringManagerJobs(signal: AbortSignal): Promise<HiringManagerJob[]> {
  return get<HiringManagerJob[]>('/api/jobs', signal);
}

export function getCandidate(id: string, signal: AbortSignal): Promise<CandidateRecord> {
  return get<CandidateRecord>(`/api/candidates/${encodeURIComponent(id)}/profile`, signal);
}

export function getCandidateCv(id: string, signal: AbortSignal): Promise<CandidateCvResult> {
  return get<CandidateCvResult>(`/api/candidates/${encodeURIComponent(id)}/cv`, signal);
}

export function getCandidateCvApiOrigin(): string {
  return new URL(API_URL).origin;
}

/** S4-09: download a protected PDF as a Blob; the JWT never appears in the URL. */
export async function getCandidateCvPdf(id: string, signal: AbortSignal): Promise<Blob> {
  const token = sessionStorage.getItem('accessToken');
  if (!token) throw new CandidateApiError('unauthorized');
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/candidates/${encodeURIComponent(id)}/cv/preview`, {
      headers: { Authorization: `Bearer ${token}` }, signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new CandidateApiError('network');
  }
  if (response.status === 401) throw new CandidateApiError('unauthorized');
  if (response.status === 403) throw new CandidateApiError('forbidden');
  if (response.status === 404) throw new CandidateApiError('notFound');
  if (!response.ok || !(response.headers.get('Content-Type') || '').includes('application/pdf')) {
    throw new CandidateApiError('server');
  }
  return response.blob();
}

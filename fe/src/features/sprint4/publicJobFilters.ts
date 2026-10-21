export type PublicJobListing = {
  id: string;
  title: string;
  description?: string | null; // S4-01 BE must include in public listing response.
  location: string;
  workMode?: string | null;
  applicationDeadline?: string | null;
  status?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  department?: { name?: string } | null;
};

export type JobFilters = {
  keyword: string;
  department: string;
  location: string;
  workMode: string;
};

function normalized(value?: string | null) {
  return (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLocaleLowerCase('vi').trim();
}

/** Additional client safeguard; server must enforce publication and deadline. */
export function isOpenPublicJob(job: PublicJobListing, now = new Date()): boolean {
  if (job.status != null && job.status !== 'PUBLISHED') return false;
  if (job.approvedAt === null || job.publishedAt === null) return false;
  if (job.applicationDeadline) {
    const deadline = new Date(job.applicationDeadline);
    if (!Number.isNaN(deadline.getTime()) && deadline.getTime() < now.getTime()) return false;
  }
  return true;
}

export function filterPublicJobs(jobs: PublicJobListing[], filters: JobFilters, now = new Date()): PublicJobListing[] {
  const keyword = normalized(filters.keyword);
  return jobs.filter(job => {
    if (!isOpenPublicJob(job, now)) return false;
    if (filters.department !== 'ALL' && job.department?.name !== filters.department) return false;
    if (filters.location !== 'ALL' && job.location !== filters.location) return false;
    if (filters.workMode !== 'ALL' && job.workMode !== filters.workMode) return false;
    // Description is returned by the S4-01 BE listing contract; never fake matches.
    return !keyword || [job.title, job.description].some(value => normalized(value).includes(keyword));
  });
}

export function publicJobFilterOptions(jobs: PublicJobListing[], now = new Date()) {
  const visible = jobs.filter(job => isOpenPublicJob(job, now));
  const sortVi = (a: string, b: string) => a.localeCompare(b, 'vi');
  return {
    departments: [...new Set(visible.map(j => j.department?.name).filter((v): v is string => !!v))].sort(sortVi),
    locations: [...new Set(visible.map(j => j.location).filter(Boolean))].sort(sortVi),
  };
}

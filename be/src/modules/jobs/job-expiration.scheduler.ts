import { prisma } from '../../database/prisma';
import { logAudit } from '../../middleware/audit-logger';
import { AuditAction } from '../../rbac/types';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Expire published postings after their application deadline. Safe to run repeatedly. */
export async function expireDueJobs(now = new Date()): Promise<number> {
  const dueJobs = await prisma.job.findMany({
    where: { status: 'PUBLISHED', applicationDeadline: { lte: now } },
    select: { id: true, title: true, applicationDeadline: true },
  });
  if (!dueJobs.length) return 0;

  let expired = 0;
  for (const job of dueJobs) {
    // Only the worker that changes PUBLISHED -> EXPIRED writes the audit record.
    const result = await prisma.job.updateMany({
      where: { id: job.id, status: 'PUBLISHED', applicationDeadline: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    if (result.count !== 1) continue;
    expired += 1;
    await logAudit({
      action: AuditAction.JOB_POSTING_EXPIRED,
      resourceType: 'job',
      resourceId: job.id,
      metadata: {
        previousStatus: 'PUBLISHED',
        applicationDeadline: job.applicationDeadline?.toISOString(),
        title: job.title,
      },
    });
  }
  return expired;
}

export function millisecondsUntilNextVietnamMidnight(now: Date): number {
  const vietnamNow = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
  const nextMidnight = Date.UTC(
    vietnamNow.getUTCFullYear(),
    vietnamNow.getUTCMonth(),
    vietnamNow.getUTCDate() + 1,
  );
  return Math.max(1, nextMidnight - vietnamNow.getTime());
}

/** Catch up on startup, then run once daily at midnight Vietnam time. */
export function startJobExpirationScheduler(): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;

  const runAndSchedule = async () => {
    if (stopped) return;
    try {
      const expiredCount = await expireDueJobs();
      if (expiredCount) console.info(`Expired ${expiredCount} job posting(s).`);
    } catch (error) {
      console.error('Failed to expire due job postings:', error);
    }

    if (!stopped) {
      timer = setTimeout(runAndSchedule, millisecondsUntilNextVietnamMidnight(new Date()));
    }
  };

  void runAndSchedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

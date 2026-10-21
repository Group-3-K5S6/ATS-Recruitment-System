import { prisma } from '../../database/prisma';
import { AuthenticatedUser } from '../../rbac/types';
import { RoleType } from '../../rbac/roles';
import { CandidatePolicy } from '../../policies/candidate.policy';
import { Prisma } from '@prisma/client';
import { randomBytes, createHmac } from 'crypto';
import { env } from '../../config/env';

export class CandidateService {
  /**
   * Scoped query: directly filter at database level according to user role & scope
   */
  static async findCandidateForUser(candidateId: string, currentUser: AuthenticatedUser) {
    // 1. Admin & HR Manager: Global access
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER)
    ) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: {
          applications: {
            include: {
              job: true,
              interviews: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // Recruiter: only candidates attached to assigned requisitions.
    // Filter the INCLUDED applications as well; otherwise an allowed candidate
    // would leak their applications to other jobs and departments.
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const assignmentScope = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const candidate = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: assignmentScope } },
        include: {
          applications: {
            where: assignmentScope,
            include: { job: true, interviews: true },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 2. Candidate: Only their own profile
    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          userId: currentUser.id,
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 3. Hiring Manager: Candidate must have applied to a job in their department or managed by them
    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          applications: {
            some: {
              job: {
                OR: [
                  { hiringManagerId: currentUser.id },
                  currentUser.departmentId ? { departmentId: currentUser.departmentId } : {},
                ],
              },
            },
          },
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 4. Interviewer: Candidate must be scheduled for an interview with this interviewer
    if (currentUser.roles.includes(RoleType.INTERVIEWER)) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          id: candidateId,
          applications: {
            some: {
              interviews: {
                some: {
                  interviewerId: currentUser.id,
                },
              },
            },
          },
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: {
                where: { interviewerId: currentUser.id },
              },
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    // 5. Approver: Candidates with pending offers or in approval workflow
    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: {
          applications: {
            include: {
              job: true,
            },
          },
        },
      });
      return candidate ? CandidatePolicy.sanitize(currentUser, candidate) : null;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Unified profile include helper — shared between role branches
  // ---------------------------------------------------------------------------

  /**
   * Full include for unified profile (applications + job + requisition +
   * interviews + evaluations + offers). Callers may add a `where` clause on
   * `applications` to scope by role.
   */
  private static unifiedProfileInclude(applicationWhere?: Prisma.ApplicationWhereInput) {
    return {
      applications: {
        where: applicationWhere,
        orderBy: { createdAt: 'desc' as const },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              status: true,
              location: true,
              applicationDeadline: true,
              departmentId: true,
              hiringManagerId: true,
              recruiterId: true,
              createdAt: true,
              department: { select: { id: true, name: true, code: true } },
              hiringManager: { select: { id: true, fullName: true, email: true } },
            },
          },
          interviews: {
            orderBy: { scheduledAt: 'asc' as const },
            include: {
              interviewer: { select: { id: true, fullName: true, email: true } },
              evaluations: {
                select: {
                  id: true,
                  score: true,
                  technicalNotes: true,
                  culturalNotes: true,
                  recommendation: true,
                  createdAt: true,
                  // Do NOT expose interviewerId — redundant and already on Interview
                },
              },
            },
          },
          offers: {
            orderBy: { createdAt: 'desc' as const },
            select: {
              id: true,
              status: true,
              baseSalary: true,
              createdAt: true,
              updatedAt: true,
              // internalNotes intentionally omitted — sanitised later per role
            },
          },
        },
      },
    } satisfies Prisma.CandidateInclude;
  }

  /**
   * Sanitise unified-profile data per role.
   *  - CANDIDATE: remove internalNotes (already not selected) and
   *    evaluations (internal).
   *  - INTERVIEWER: apply the standard phone/salary/address mask plus
   *    hide evaluations written by others.
   *  - All other roles: return as-is (evaluations visible to RECRUITER,
   *    HR_MANAGER, ADMIN, HIRING_MANAGER, APPROVER).
   */
  private static sanitizeUnifiedProfile(user: AuthenticatedUser, profile: any): any {
    if (!profile) return null;

    // Strip evaluation details for CANDIDATE — they must never see internal review notes
    if (user.roles.includes(RoleType.CANDIDATE)) {
      const sanitisedApps = (profile.applications ?? []).map((app: any) => ({
        ...app,
        interviews: (app.interviews ?? []).map((iv: any) => {
          const { evaluations, ...ivWithout } = iv;
          return ivWithout;
        }),
      }));
      return CandidatePolicy.sanitize(user, { ...profile, applications: sanitisedApps });
    }

    // INTERVIEWER: mask personal fields + only show evaluations they wrote
    if (user.roles.includes(RoleType.INTERVIEWER)) {
      const sanitisedApps = (profile.applications ?? []).map((app: any) => ({
        ...app,
        interviews: (app.interviews ?? []).map((iv: any) => ({
          ...iv,
          evaluations: (iv.evaluations ?? []).filter(
            (_: any) => iv.interviewerId === user.id
          ),
        })),
      }));
      return CandidatePolicy.sanitize(user, { ...profile, applications: sanitisedApps });
    }

    // RECRUITER, HR_MANAGER, ADMIN, HIRING_MANAGER, APPROVER — full profile
    return CandidatePolicy.sanitize(user, profile);
  }

  /**
   * Returns the unified candidate profile for the requesting user, scoped by
   * their role. Returns null if the user has no access.
   */
  static async getUnifiedProfile(candidateId: string, currentUser: AuthenticatedUser) {
    // 1. ADMIN & HR_MANAGER — global access, all applications
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER)
    ) {
      const profile = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: CandidateService.unifiedProfileInclude(),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 2. RECRUITER — only candidates linked to assigned requisitions (S3-06)
    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const scopeWhere = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: scopeWhere } },
        include: CandidateService.unifiedProfileInclude(scopeWhere),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 3. CANDIDATE — own profile only
    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, userId: currentUser.id },
        include: CandidateService.unifiedProfileInclude(),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 4. HIRING_MANAGER — candidates who applied to their department's jobs
    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const scopeWhere: Prisma.ApplicationWhereInput = {
        job: {
          OR: [
            { hiringManagerId: currentUser.id },
            ...(currentUser.departmentId ? [{ departmentId: currentUser.departmentId }] : []),
          ],
        },
      };
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: scopeWhere } },
        include: CandidateService.unifiedProfileInclude(scopeWhere),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 5. INTERVIEWER — candidates assigned to them for an interview
    if (currentUser.roles.includes(RoleType.INTERVIEWER)) {
      const scopeWhere: Prisma.ApplicationWhereInput = {
        interviews: { some: { interviewerId: currentUser.id } },
      };
      const profile = await prisma.candidate.findFirst({
        where: { id: candidateId, applications: { some: scopeWhere } },
        // Include ALL the candidate's applications so context is complete,
        // but filter interviews to those involving this interviewer.
        include: CandidateService.unifiedProfileInclude({
          interviews: { some: { interviewerId: currentUser.id } },
        }),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    // 6. APPROVER — full read (same as existing policy)
    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const profile = await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: CandidateService.unifiedProfileInclude(),
      });
      return CandidateService.sanitizeUnifiedProfile(currentUser, profile);
    }

    return null;
  }

  /**
   * Scoped candidate listing: retrieves only candidates within user scope
   */
  static async listCandidatesForUser(currentUser: AuthenticatedUser) {
    if (
      currentUser.roles.includes(RoleType.ADMIN) ||
      currentUser.roles.includes(RoleType.HR_MANAGER)
    ) {
      const candidates = await prisma.candidate.findMany({
        include: {
          applications: {
            include: { job: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.RECRUITER)) {
      const assignmentScope = CandidatePolicy.recruiterApplicationWhere(currentUser.id);
      const candidates = await prisma.candidate.findMany({
        where: { applications: { some: assignmentScope } },
        include: {
          applications: {
            where: assignmentScope,
            include: { job: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.CANDIDATE)) {
      const candidates = await prisma.candidate.findMany({
        where: { userId: currentUser.id },
        include: {
          applications: {
            include: { job: true },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.HIRING_MANAGER)) {
      const candidates = await prisma.candidate.findMany({
        where: {
          applications: {
            some: {
              job: {
                OR: [
                  { hiringManagerId: currentUser.id },
                  currentUser.departmentId ? { departmentId: currentUser.departmentId } : {},
                ],
              },
            },
          },
        },
        include: {
          applications: {
            include: { job: true },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.INTERVIEWER)) {
      const candidates = await prisma.candidate.findMany({
        where: {
          applications: {
            some: {
              interviews: {
                some: {
                  interviewerId: currentUser.id,
                },
              },
            },
          },
        },
        include: {
          applications: {
            include: {
              job: true,
              interviews: {
                where: { interviewerId: currentUser.id },
              },
            },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    if (currentUser.roles.includes(RoleType.APPROVER)) {
      const candidates = await prisma.candidate.findMany({
        include: {
          applications: {
            include: { job: true },
          },
        },
      });
      return candidates.map((c) => CandidatePolicy.sanitize(currentUser, c));
    }

    return [];
  }

  /**
   * Public lookup for candidate application status by tracking code and email.
   *
   * Security & Design rules:
   * 1. A tracking code represents EXACTLY ONE specific Application record, never a Candidate.
   * 2. Candidate IDs and raw guessable Application IDs are strictly rejected.
   * 3. Codes must be random/unguessable and registered or cryptographically HMAC-verified.
   * 4. Returns ONLY generic status ({ trackingCode, status, statusLabel }). No PII or internal data.
   * 5. Mismatched emails and non-existent codes return identical null -> 404 NOT_FOUND.
   */
  static async trackApplicationStatus(
    trackingCode: string,
    email: string
  ): Promise<PublicTrackingResult | null> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    const cleanTrackingCode = (trackingCode || '').trim();

    if (!cleanTrackingCode || !normalizedEmail) {
      return null;
    }

    // 1. Direct persistent database query by unique trackingCode
    // (Notice: Candidate IDs and raw guessable Application IDs are strictly rejected)
    const application = await prisma.application.findUnique({
      where: { trackingCode: cleanTrackingCode },
      include: {
        candidate: {
          select: {
            id: true,
            email: true,
          },
        },
      },
    });

    if (application && application.candidate) {
      // 2. Strict email verification: must belong to the Candidate of this Application
      if (application.candidate.email.trim().toLowerCase() !== normalizedEmail) {
        // Return null without disclosing whether trackingCode exists or not
        return null;
      }

      // 3. Map internal stage & status to candidate-facing generic status
      const mapped = mapApplicationStatus(application.stage, application.status);
      return {
        trackingCode: cleanTrackingCode,
        status: mapped.status,
        statusLabel: mapped.statusLabel,
      };
    }

    // 4. Fallback for unmigrated environments (HMAC opaque code or in-memory registry)
    const targetApplicationId = resolveTrackingCode(cleanTrackingCode);
    if (targetApplicationId) {
      const fallbackApp = await prisma.application.findUnique({
        where: { id: targetApplicationId },
        include: {
          candidate: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      });

      if (
        fallbackApp &&
        fallbackApp.candidate &&
        fallbackApp.candidate.email.trim().toLowerCase() === normalizedEmail
      ) {
        const mapped = mapApplicationStatus(fallbackApp.stage, fallbackApp.status);
        return {
          trackingCode: cleanTrackingCode,
          status: mapped.status,
          statusLabel: mapped.statusLabel,
        };
      }
    }

    // Not found or email mismatched -> generic null (404 NOT_FOUND)
    return null;
  }
}

// =========================================================================
// Tracking Code Management & Cryptographic Resolver
// =========================================================================

// In-memory registry for tracking codes mapped to application IDs
// Used when applications are created and in tests
const trackingCodeRegistry = new Map<string, string>();

/**
 * Register a tracking code for a specific application.
 */
export function registerTrackingCode(trackingCode: string, applicationId: string): void {
  trackingCodeRegistry.set(trackingCode.trim().toUpperCase(), applicationId);
}

/**
 * Clear the in-memory tracking code registry (for tests)
 */
export function clearTrackingCodeRegistry(): void {
  trackingCodeRegistry.clear();
}

/**
 * Generate a cryptographically random, unguessable tracking code for job applications.
 * Base32 alphabet (no ambiguous chars: 0, O, 1, I, L)
 * Example: ATS-7K9M2P4X8Q1W
 * Entropy: 32^12 ≈ 1.15e18 combinations, preventing brute-force guessing.
 */
export function generateTrackingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(12);
  let result = 'ATS-';
  for (let i = 0; i < 12; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a cryptographically secure, unique tracking code with collision handling.
 * Checks the database Application table to prevent collisions.
 * In case of collision, it retries up to maxRetries times.
 */
export async function generateUniqueTrackingCode(maxRetries = 5): Promise<string> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const code = generateTrackingCode();
    const existing = await prisma.application.findUnique({
      where: { trackingCode: code },
      select: { id: true },
    });
    if (!existing) {
      return code;
    }
  }
  throw new Error('Failed to generate a unique tracking code after multiple attempts');
}

const HMAC_SECRET = env.TRACKING_CODE_SECRET;

if (HMAC_SECRET.length < 32) {
  throw new Error(
    'TRACKING_CODE_SECRET must be configured with at least 32 characters',
  );
}

/**
 * Generate a cryptographically signed, unguessable tracking code bound to a specific application ID.
 * Format: ATS-TK-<12_HEX_HMAC>-<BASE64URL_APP_ID>
 * This provides unguessable tracking codes without requiring schema migration on shared databases.
 */
export function generateOpaqueTrackingCode(applicationId: string): string {
  const hmac = createHmac('sha256', HMAC_SECRET)
    .update(applicationId)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase();
  const encodedId = Buffer.from(applicationId).toString('base64url');
  return `ATS-TK-${hmac}-${encodedId}`;
}

/**
 * Resolve tracking code to applicationId.
 * - Rejects raw Candidate IDs and guessable raw Application IDs.
 * - Resolves registered unguessable tracking codes.
 * - Resolves cryptographically signed opaque tracking codes.
 */
export function resolveTrackingCode(trackingCode: string): string | null {
  const normalized = trackingCode.trim().toUpperCase();

  // 1. Check in registry (for codes generated via generateTrackingCode())
  const fromRegistry = trackingCodeRegistry.get(normalized);
  if (fromRegistry) {
    return fromRegistry;
  }

  // 2. Check cryptographically signed opaque tracking code (ATS-TK-<HMAC>-<encodedId>)
  if (normalized.startsWith('ATS-TK-')) {
    const parts = trackingCode.trim().split('-');
    if (parts.length === 4 && parts[0].toUpperCase() === 'ATS' && parts[1].toUpperCase() === 'TK') {
      const hmacPart = parts[2].toUpperCase();
      const encodedId = parts[3];
      try {
        const decodedAppId = Buffer.from(encodedId, 'base64url').toString('utf8');
        const expectedHmac = createHmac('sha256', HMAC_SECRET)
          .update(decodedAppId)
          .digest('hex')
          .slice(0, 12)
          .toUpperCase();
        if (hmacPart === expectedHmac) {
          return decodedAppId;
        }
      } catch {
        return null;
      }
    }
  }

  return null;
}

// =========================================================================
// Status Mapping Logic
// =========================================================================

export type PublicTrackingStatus = 'RECEIVED' | 'UNDER_REVIEW' | 'INTERVIEW' | 'COMPLETED';

export interface PublicTrackingResult {
  trackingCode: string;
  status: PublicTrackingStatus;
  statusLabel: string;
}

export const TRACKING_STATUS_LABELS: Record<PublicTrackingStatus, string> = {
  RECEIVED: 'Đã nhận',
  UNDER_REVIEW: 'Đang xem xét',
  INTERVIEW: 'Mời phỏng vấn',
  COMPLETED: 'Kết thúc',
};

/**
 * Maps internal application stage and status to the 4 generic candidate-facing statuses.
 *
 * Rules:
 * 1. Non-active or terminal states MUST NEVER map to active states (RECEIVED / UNDER_REVIEW / INTERVIEW).
 * 2. Active stages map to their respective public lifecycle stage.
 * 3. Default fallback for unknown active stages is UNDER_REVIEW.
 */
export function mapApplicationStatus(
  stage: string | null | undefined,
  status: string | null | undefined
): { status: PublicTrackingStatus; statusLabel: string } {
  const normStatus = (status || '').trim().toUpperCase();
  const normStage = (stage || '').trim().toUpperCase();

  // 1. Terminal / Completed states (must always be COMPLETED)
  if (
    normStatus !== 'ACTIVE' ||
    ['OFFER', 'HIRED', 'REJECTED', 'CLOSED', 'WITHDRAWN', 'COMPLETED'].includes(normStage)
  ) {
    return { status: 'COMPLETED', statusLabel: TRACKING_STATUS_LABELS.COMPLETED };
  }

  // 2. Interview phase
  if (['INTERVIEW', 'INTERVIEWING'].includes(normStage)) {
    return { status: 'INTERVIEW', statusLabel: TRACKING_STATUS_LABELS.INTERVIEW };
  }

  // 3. Screening / Review phase
  if (['SCREENING', 'UNDER_REVIEW'].includes(normStage)) {
    return { status: 'UNDER_REVIEW', statusLabel: TRACKING_STATUS_LABELS.UNDER_REVIEW };
  }

  // 4. Initial / Applied phase
  if (normStage === 'APPLIED') {
    return { status: 'RECEIVED', statusLabel: TRACKING_STATUS_LABELS.RECEIVED };
  }

  // Default fallback for any other active stage
  return { status: 'UNDER_REVIEW', statusLabel: TRACKING_STATUS_LABELS.UNDER_REVIEW };
}

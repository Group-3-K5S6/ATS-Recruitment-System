import { PrismaClient } from '@prisma/client';
import { RoleType, ROLE_DESCRIPTIONS, ALL_ROLES } from '../src/rbac/roles';
import { ALL_PERMISSIONS } from '../src/rbac/permissions';
import { ROLE_PERMISSIONS } from '../src/rbac/role-permissions';
import { hashPassword } from '../src/utils/password';

const prisma = new PrismaClient();

export async function runSeed() {
  console.log('--- Starting ATS RBAC Seeding ---');

  // 1. Seed Roles
  console.log('Seeding Roles...');
  const roleMap = new Map<string, string>();
  for (const roleName of ALL_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: ROLE_DESCRIPTIONS[roleName] },
      create: {
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName],
      },
    });
    roleMap.set(roleName, role.id);
  }

  // 2. Seed Permissions
  console.log('Seeding Permissions...');
  const permissionMap = new Map<string, string>();
  for (const perm of ALL_PERMISSIONS) {
    const p = await prisma.permission.upsert({
      where: { code: perm.code },
      update: {
        module: perm.module,
        description: perm.description,
      },
      create: {
        code: perm.code,
        module: perm.module,
        description: perm.description,
      },
    });
    permissionMap.set(perm.code, p.id);
  }

  // 3. Seed Role-Permission Associations
  console.log('Seeding Role-Permission mappings...');
  for (const roleName of ALL_ROLES) {
    const roleId = roleMap.get(roleName)!;
    const permissionsForRole = ROLE_PERMISSIONS[roleName] || [];

    for (const permCode of permissionsForRole) {
      const permId = permissionMap.get(permCode);
      if (permId) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId: permId,
            },
          },
          update: {},
          create: {
            roleId,
            permissionId: permId,
          },
        });
      }
    }
  }

  // 4. Seed Departments
  console.log('Seeding Departments...');
  const engDept = await prisma.department.upsert({
    where: { code: 'ENG' },
    update: {},
    create: { name: 'Kỹ thuật phần mềm', code: 'ENG' },
  });

  const hrDept = await prisma.department.upsert({
    where: { code: 'HR' },
    update: {},
    create: { name: 'Nhân sự', code: 'HR' },
  });

  const mktDept = await prisma.department.upsert({
    where: { code: 'MKT' },
    update: {},
    create: { name: 'Marketing & Truyền thông', code: 'MKT' },
  });

  // 5. Seed Test Users (Default password: Password123!)
  console.log('Seeding Test Users...');
  const defaultPasswordHash = await hashPassword('Password123!');

  async function seedUser(
    email: string,
    fullName: string,
    roleType: RoleType,
    deptId?: string
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      update: { departmentId: deptId || null },
      create: {
        email,
        fullName,
        passwordHash: defaultPasswordHash,
        departmentId: deptId || null,
        isActive: true,
      },
    });

    const roleId = roleMap.get(roleType)!;
    await prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: user.id,
          roleId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        roleId,
      },
    });

    return user;
  }

  const admin = await seedUser('admin@ats.local', 'System Administrator', RoleType.ADMIN);
  const hrManager = await seedUser('hr_manager@ats.local', 'HR Manager User', RoleType.HR_MANAGER, hrDept.id);
  const recruiter1 = await seedUser('recruiter1@ats.local', 'Recruiter One', RoleType.RECRUITER, hrDept.id);
  const recruiter2 = await seedUser('recruiter2@ats.local', 'Recruiter Two', RoleType.RECRUITER, hrDept.id);
  const hmEng = await seedUser('hiring_manager_eng@ats.local', 'Engineering Lead', RoleType.HIRING_MANAGER, engDept.id);
  const hmMkt = await seedUser('hiring_manager_mkt@ats.local', 'Marketing Lead', RoleType.HIRING_MANAGER, mktDept.id);
  const interviewer1 = await seedUser('interviewer1@ats.local', 'Senior Dev Interviewer', RoleType.INTERVIEWER, engDept.id);
  const interviewer2 = await seedUser('interviewer2@ats.local', 'Tech Lead Interviewer', RoleType.INTERVIEWER, engDept.id);
  const approver = await seedUser('approver@ats.local', 'VP Approver', RoleType.APPROVER, hrDept.id);
  const candidateUser1 = await seedUser('candidate1@ats.local', 'Nguyễn Văn Ứng Viên 1', RoleType.CANDIDATE);
  const candidateUser2 = await seedUser('candidate2@ats.local', 'Trần Thị Ứng Viên 2', RoleType.CANDIDATE);

  // 6. Seed Sample Requisitions
  console.log('Seeding Sample Requisitions & Jobs...');
  const reqEng = await prisma.requisition.upsert({
    where: { id: 'req-eng-001' },
    update: {},
    create: {
      id: 'req-eng-001',
      title: 'Tuyển dụng Senior Backend Engineer',
      departmentId: engDept.id,
      hiringManagerId: hmEng.id,
      approverId: approver.id,
      status: 'APPROVED',
      headcount: 2,
      budget: 50000000,
    },
  });

  const reqMkt = await prisma.requisition.upsert({
    where: { id: 'req-mkt-001' },
    update: {},
    create: {
      id: 'req-mkt-001',
      title: 'Tuyển dụng Marketing Specialist',
      departmentId: mktDept.id,
      hiringManagerId: hmMkt.id,
      approverId: approver.id,
      status: 'PENDING_APPROVAL',
      headcount: 1,
      budget: 20000000,
    },
  });

  // 7. Seed Sample Jobs
  const jobEng = await prisma.job.upsert({
    where: { id: 'job-eng-001' },
    update: {},
    create: {
      id: 'job-eng-001',
      title: 'Senior Backend Engineer (NodeJS/TypeScript)',
      requisitionId: reqEng.id,
      departmentId: engDept.id,
      hiringManagerId: hmEng.id,
      recruiterId: recruiter1.id,
      status: 'PUBLISHED',
      description: 'Phát triển backend microservices và hệ thống RBAC an toàn.',
      location: 'Hanoi',
    },
  });

  const jobMkt = await prisma.job.upsert({
    where: { id: 'job-mkt-001' },
    update: {},
    create: {
      id: 'job-mkt-001',
      title: 'Marketing Campaign Lead',
      requisitionId: reqMkt.id,
      departmentId: mktDept.id,
      hiringManagerId: hmMkt.id,
      recruiterId: recruiter2.id,
      status: 'DRAFT',
      description: 'Lập chiến lược truyền thông và tuyển dụng nội bộ.',
      location: 'Hanoi',
    },
  });

  // 8. Seed Candidates & Applications
  console.log('Seeding Sample Candidates & Applications...');
  const cand1 = await prisma.candidate.upsert({
    where: { id: 'cand-001' },
    update: {},
    create: {
      id: 'cand-001',
      userId: candidateUser1.id,
      fullName: 'Nguyễn Văn Ứng Viên 1',
      email: candidateUser1.email,
      phone: '0987654321',
      cvUrl: 'https://secure-ats.internal/cv/nguyen-van-a.pdf',
      address: '123 Cầu Giấy, Hà Nội',
      expectedSalary: 35000000,
      currentCompany: 'Công ty Công nghệ XYZ',
    },
  });

  const cand2 = await prisma.candidate.upsert({
    where: { id: 'cand-002' },
    update: {},
    create: {
      id: 'cand-002',
      userId: candidateUser2.id,
      fullName: 'Trần Thị Ứng Viên 2',
      email: candidateUser2.email,
      phone: '0912345678',
      cvUrl: 'https://secure-ats.internal/cv/tran-thi-b.pdf',
      address: '456 Đống Đa, Hà Nội',
      expectedSalary: 18000000,
      currentCompany: 'Công ty Truyền thông ABC',
    },
  });

  // Candidate 1 applies to Job 1 (ENG)
  const app1 = await prisma.application.upsert({
    where: { id: 'app-001' },
    update: {},
    create: {
      id: 'app-001',
      candidateId: cand1.id,
      jobId: jobEng.id,
      stage: 'INTERVIEWING',
      status: 'ACTIVE',
      assignedRecruiterId: recruiter1.id,
    },
  });

  // Candidate 2 applies to Job 2 (MKT)
  const app2 = await prisma.application.upsert({
    where: { id: 'app-002' },
    update: {},
    create: {
      id: 'app-002',
      candidateId: cand2.id,
      jobId: jobMkt.id,
      stage: 'APPLIED',
      status: 'ACTIVE',
      assignedRecruiterId: recruiter2.id,
    },
  });

  // 9. Seed Interview & Evaluation
  const interview1 = await prisma.interview.upsert({
    where: { id: 'interview-001' },
    update: {},
    create: {
      id: 'interview-001',
      applicationId: app1.id,
      interviewerId: interviewer1.id,
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      durationMinutes: 60,
      status: 'SCHEDULED',
      meetingLink: 'https://meet.internal/interview-cand-001',
    },
  });

  await prisma.evaluation.upsert({
    where: { id: 'eval-001' },
    update: {},
    create: {
      id: 'eval-001',
      interviewId: interview1.id,
      interviewerId: interviewer1.id,
      score: 9,
      technicalNotes: 'Kiến thức backend xuất sắc, hiểu rõ RBAC và security.',
      culturalNotes: 'Tinh thần hợp tác cao, giao tiếp mạch lạc.',
      recommendation: 'STRONG_HIRE',
    },
  });

  // 10. Seed Offer
  await prisma.offer.upsert({
    where: { id: 'offer-001' },
    update: {},
    create: {
      id: 'offer-001',
      applicationId: app1.id,
      recruiterId: recruiter1.id,
      approverId: approver.id,
      baseSalary: 38000000,
      status: 'PENDING_APPROVAL',
      internalNotes: 'Đề xuất mức lương 38M phù hợp ngân sách vị trí Senior.',
    },
  });

  console.log('--- ATS RBAC Seeding Completed Successfully ---');
}

if (require.main === module) {
  runSeed()
    .catch((err) => {
      console.error('Seed error:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

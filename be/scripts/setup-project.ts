import { PrismaClient } from "@prisma/client";
import {
  ALL_ROLES,
  ROLE_DESCRIPTIONS,
} from "../src/rbac/roles";
import { ALL_PERMISSIONS } from "../src/rbac/permissions";
import { ROLE_PERMISSIONS } from "../src/rbac/role-permissions";

const prisma = new PrismaClient();

const FRAMEWORK_ID = "framework-s207-test";
const CRITERION_ID = "criterion-s207-test";

const QUESTION_REST_ID =
  "045fc02d-042b-434f-8f42-be8a53506dab";

const QUESTION_DI_ID =
  "d0782839-f891-4e16-8f00-1da9ed808740";

async function main() {
  console.log("========================================");
  console.log("THIẾT LẬP DỮ LIỆU CHUNG ATS");
  console.log("========================================");

  /*
   * 1. Đồng bộ vai trò
   */
  console.log("\n[1] Đồng bộ vai trò...");

  const roleMap = new Map<string, string>();

  for (const roleName of ALL_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        name: roleName,
      },
      update: {
        description: ROLE_DESCRIPTIONS[roleName],
      },
      create: {
        name: roleName,
        description: ROLE_DESCRIPTIONS[roleName],
      },
    });

    roleMap.set(roleName, role.id);
  }

  /*
   * 2. Đồng bộ quyền
   */
  console.log("[2] Đồng bộ quyền...");

  const permissionMap = new Map<string, string>();

  for (const definition of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: {
        code: definition.code,
      },
      update: {
        module: definition.module,
        description: definition.description,
      },
      create: {
        code: definition.code,
        module: definition.module,
        description: definition.description,
      },
    });

    permissionMap.set(definition.code, permission.id);
  }

  /*
   * 3. Đồng bộ Role - Permission
   *
   * Chỉ cập nhật bảng phân quyền.
   * Không xóa User.
   * Không đổi email.
   * Không đổi mật khẩu.
   */
  console.log("[3] Đồng bộ phân quyền...");

  await prisma.$transaction(async (tx) => {
    for (const roleName of ALL_ROLES) {
      const roleId = roleMap.get(roleName);

      if (!roleId) {
        continue;
      }

      await tx.rolePermission.deleteMany({
        where: {
          roleId,
        },
      });

      const permissions =
        ROLE_PERMISSIONS[roleName] || [];

      for (const code of permissions) {
        const permissionId =
          permissionMap.get(code);

        if (!permissionId) {
          continue;
        }

        await tx.rolePermission.create({
          data: {
            roleId,
            permissionId,
          },
        });
      }
    }
  });

  /*
   * 4. Khung năng lực S2-06
   */
  console.log("[4] Đồng bộ khung năng lực...");

  await prisma.competencyFramework.upsert({
    where: {
      id: FRAMEWORK_ID,
    },
    update: {
      name: "Khung năng lực Backend",
      description:
        "Khung năng lực dùng cho vị trí Backend",
      isActive: true,
    },
    create: {
      id: FRAMEWORK_ID,
      name: "Khung năng lực Backend",
      description:
        "Khung năng lực dùng cho vị trí Backend",
      isActive: true,
    },
  });

  /*
   * 5. Tiêu chí năng lực
   */
  console.log("[5] Đồng bộ tiêu chí năng lực...");

  await prisma.competencyCriterion.upsert({
    where: {
      id: CRITERION_ID,
    },
    update: {
      frameworkId: FRAMEWORK_ID,
      name: "Kiến thức chuyên môn",
      description:
        "Đánh giá kiến thức chuyên môn Backend",
      weight: 40,
    },
    create: {
      id: CRITERION_ID,
      frameworkId: FRAMEWORK_ID,
      name: "Kiến thức chuyên môn",
      description:
        "Đánh giá kiến thức chuyên môn Backend",
      weight: 40,
    },
  });

  /*
   * 6. Liên kết với chức danh Backend
   */
  console.log("[6] Liên kết chức danh...");

  const backendJob = await prisma.job.findUnique({
    where: {
      id: "job-eng-001",
    },
  });

  if (backendJob) {
    await prisma.jobCompetencyFramework.upsert({
      where: {
        jobId_frameworkId: {
          jobId: backendJob.id,
          frameworkId: FRAMEWORK_ID,
        },
      },
      update: {},
      create: {
        jobId: backendJob.id,
        frameworkId: FRAMEWORK_ID,
      },
    });
  } else {
    console.warn(
      "Không tìm thấy job-eng-001. Bỏ qua liên kết chức danh."
    );
  }

  /*
   * 7. Ngân hàng câu hỏi S2-07
   */
  console.log("[7] Đồng bộ câu hỏi phỏng vấn...");

  if (backendJob) {
    await prisma.interviewQuestion.upsert({
      where: {
        id: QUESTION_REST_ID,
      },
      update: {
        question:
          "REST API là gì và khi nào nên sử dụng?",
        difficulty: "MEDIUM",
        suggestedAnswer:
          "Ứng viên giải thích được REST, HTTP method, resource và nguyên tắc thiết kế API.",
        competencyCriterionId: CRITERION_ID,
        jobId: backendJob.id,
      },
      create: {
        id: QUESTION_REST_ID,
        question:
          "REST API là gì và khi nào nên sử dụng?",
        difficulty: "MEDIUM",
        suggestedAnswer:
          "Ứng viên giải thích được REST, HTTP method, resource và nguyên tắc thiết kế API.",
        competencyCriterionId: CRITERION_ID,
        jobId: backendJob.id,
      },
    });

    await prisma.interviewQuestion.upsert({
      where: {
        id: QUESTION_DI_ID,
      },
      update: {
        question:
          "Dependency Injection là gì?",
        difficulty: "MEDIUM",
        suggestedAnswer:
          "Ứng viên giải thích được cách truyền dependency từ bên ngoài để giảm phụ thuộc giữa các thành phần.",
        competencyCriterionId: CRITERION_ID,
        jobId: backendJob.id,
      },
      create: {
        id: QUESTION_DI_ID,
        question:
          "Dependency Injection là gì?",
        difficulty: "MEDIUM",
        suggestedAnswer:
          "Ứng viên giải thích được cách truyền dependency từ bên ngoài để giảm phụ thuộc giữa các thành phần.",
        competencyCriterionId: CRITERION_ID,
        jobId: backendJob.id,
      },
    });
  }

  console.log("\n========================================");
  console.log("THIẾT LẬP HOÀN TẤT");
  console.log("========================================");

  console.log(
    "✓ Vai trò và quyền đã đồng bộ"
  );
  console.log(
    "✓ Quyền S2-07 của HR Manager đã đồng bộ"
  );
  console.log(
    "✓ Khung năng lực và tiêu chí đã đồng bộ"
  );
  console.log(
    "✓ Ngân hàng câu hỏi đã đồng bộ"
  );
  console.log(
    "✓ Không thay đổi tài khoản người dùng"
  );
}

main()
  .catch((error) => {
    console.error(
      "\nThiết lập thất bại:",
      error
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

-- S3-06 follow-up: restore the missing FK for Requisition.leadRecruiterId.
-- This migration must sort AFTER 20261013_s3_03_requisition_recruiter_assignment.
-- Prior S3-06 migration only added the column; Prisma expects a User FK.
-- Rebuild copies ALL existing Requisition columns, including assignment fields.
-- Do NOT execute manually against existing production or db-push databases.
-- Apply using Prisma migration history only after a verified backup and rehearsal.

-- Refuse incompatible or already-fixed states. In particular, do not rebuild if
-- any current lead recruiter id does not point to an existing User.
CREATE TEMP TABLE "__ats_lead_fk_guard" (
    "missing_lead_column" INTEGER NOT NULL CHECK ("missing_lead_column" = 0),
    "already_has_fk" INTEGER NOT NULL CHECK ("already_has_fk" = 0),
    "orphan_leads" INTEGER NOT NULL CHECK ("orphan_leads" = 0)
);
INSERT INTO "__ats_lead_fk_guard"
  ("missing_lead_column", "already_has_fk", "orphan_leads")
SELECT
    (SELECT COUNT(*) FROM pragma_table_info('Requisition') WHERE name = 'leadRecruiterId') != 1,
    (SELECT COUNT(*) FROM pragma_foreign_key_list('Requisition') WHERE "from" = 'leadRecruiterId'),
    (SELECT COUNT(*) FROM "Requisition" r
       WHERE r."leadRecruiterId" IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."id" = r."leadRecruiterId"));
DROP TABLE "__ats_lead_fk_guard";

-- Standard Prisma SQLite table redefinition. FK checks are restored after.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Additional safety: if foreign_keys could not be disabled, abort BEFORE DROP.
CREATE TEMP TABLE "__ats_fk_off_guard" (
    "foreign_keys_still_on" INTEGER NOT NULL CHECK ("foreign_keys_still_on" = 0)
);
INSERT INTO "__ats_fk_off_guard" ("foreign_keys_still_on")
SELECT foreign_keys FROM pragma_foreign_keys;
DROP TABLE "__ats_fk_off_guard";

CREATE TABLE "new_Requisition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "hiringManagerId" TEXT NOT NULL,
    "approverId" TEXT,
    "jobTitleId" TEXT,
    "reason" TEXT,
    "proposedSalaryMin" REAL,
    "proposedSalaryMax" REAL,
    "targetDate" DATETIME,
    "description" TEXT,
    "requirements" TEXT,
    "salaryExplanation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "headcount" INTEGER NOT NULL DEFAULT 1,
    "budget" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvalWorkflowId" TEXT,
    "approvalWorkflowVersion" INTEGER,
    "approvalChain" TEXT,
    "leadRecruiterId" TEXT,
    CONSTRAINT "Requisition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Requisition_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_leadRecruiterId_fkey" FOREIGN KEY ("leadRecruiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_Requisition" (
    "id", "title", "departmentId", "hiringManagerId", "approverId",
    "jobTitleId", "reason", "proposedSalaryMin", "proposedSalaryMax", "targetDate",
    "description", "requirements", "salaryExplanation", "status", "headcount",
    "budget", "createdAt", "updatedAt", "approvalWorkflowId",
    "approvalWorkflowVersion", "approvalChain", "leadRecruiterId"
)
SELECT
    "id", "title", "departmentId", "hiringManagerId", "approverId",
    "jobTitleId", "reason", "proposedSalaryMin", "proposedSalaryMax", "targetDate",
    "description", "requirements", "salaryExplanation", "status", "headcount",
    "budget", "createdAt", "updatedAt", "approvalWorkflowId",
    "approvalWorkflowVersion", "approvalChain", "leadRecruiterId"
FROM "Requisition";

DROP TABLE "Requisition";
ALTER TABLE "new_Requisition" RENAME TO "Requisition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

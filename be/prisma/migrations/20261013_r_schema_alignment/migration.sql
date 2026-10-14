-- ATS SQLite: historical schema alignment after approval-history migrations,
-- BEFORE 20261013_s3_03_requisition_recruiter_assignment.
-- Derived from Prisma diff against the EMPTY eight-migration baseline trial.
-- Apply ONLY to databases whose actual schema matches that exact migration history.
-- DO NOT execute on an existing database populated with prisma db push.
-- DO NOT deploy directly to ATS-UI-STABLE or the real 16-user database.
--
-- STOP BEFORE ANY ALTER/DROP if legacy job-framework assignments exist: no
-- business-approved mapping from jobId to jobTitleId has been provided.
-- STOP if tables already exist (db push), or S3-06 lead recruiter column exists.
-- These constraints intentionally ABORT this migration rather than silently
-- deleting associations or rebuilding an incompatible schema.
CREATE TEMP TABLE "__ats_alignment_guard" (
    "legacy_associations" INTEGER NOT NULL CHECK ("legacy_associations" = 0),
    "already_new_tables" INTEGER NOT NULL CHECK ("already_new_tables" = 0),
    "already_s306" INTEGER NOT NULL CHECK ("already_s306" = 0),
    "unexpected_columns" INTEGER NOT NULL CHECK ("unexpected_columns" = 0)
);
INSERT INTO "__ats_alignment_guard"
  ("legacy_associations", "already_new_tables", "already_s306", "unexpected_columns")
SELECT
    (SELECT COUNT(*) FROM "JobCompetencyFramework"),
    (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('JobTitle', 'JobTitleCompetencyFramework', 'AuthSession')),
    (SELECT COUNT(*) FROM pragma_table_info('Requisition') WHERE name = 'leadRecruiterId'),
    (SELECT COUNT(*) FROM pragma_table_info('User') WHERE name IN ('avatarImage','avatarThumbnail'))
      + (SELECT COUNT(*) FROM pragma_table_info('Job') WHERE name = 'jobTitleId')
      + (SELECT COUNT(*) FROM pragma_table_info('Requisition') WHERE name IN ('jobTitleId','reason','proposedSalaryMin','proposedSalaryMax','targetDate','description','requirements','salaryExplanation'));
DROP TABLE "__ats_alignment_guard";

-- From here on, SQL matches the Prisma-generated diff. Existing data in
-- CompanyProfile, RecruitmentCategory, Job and Requisition is SELECT-copied.
-- The legacy job-framework table is dropped ONLY after confirming it was empty.

-- DropIndex
DROP INDEX "JobCompetencyFramework_frameworkId_idx";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "avatarImage" BLOB;
ALTER TABLE "User" ADD COLUMN "avatarThumbnail" BLOB;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "JobCompetencyFramework";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "JobTitle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "minSalary" REAL NOT NULL,
    "maxSalary" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobTitleCompetencyFramework" (
    "jobTitleId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("jobTitleId", "frameworkId"),
    CONSTRAINT "JobTitleCompetencyFramework_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobTitleCompetencyFramework_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "CompetencyFramework" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "companyName" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "introduction" TEXT NOT NULL DEFAULT '',
    "culture" TEXT NOT NULL DEFAULT '',
    "benefits" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "logoData" TEXT,
    "bannerData" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CompanyProfile" ("bannerData", "benefits", "companyName", "contactEmail", "culture", "id", "introduction", "isPublished", "location", "logoData", "tagline", "updatedAt", "website") SELECT "bannerData", "benefits", "companyName", "contactEmail", "culture", "id", "introduction", "isPublished", "location", "logoData", "tagline", "updatedAt", "website" FROM "CompanyProfile";
DROP TABLE "CompanyProfile";
ALTER TABLE "new_CompanyProfile" RENAME TO "CompanyProfile";
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "requisitionId" TEXT,
    "departmentId" TEXT NOT NULL,
    "hiringManagerId" TEXT NOT NULL,
    "recruiterId" TEXT,
    "jobTitleId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "location" TEXT NOT NULL DEFAULT 'Hanoi',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Job_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("createdAt", "departmentId", "description", "hiringManagerId", "id", "location", "recruiterId", "requisitionId", "status", "title", "updatedAt") SELECT "createdAt", "departmentId", "description", "hiringManagerId", "id", "location", "recruiterId", "requisitionId", "status", "title", "updatedAt" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE TABLE "new_RecruitmentCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RecruitmentCategory" ("category", "createdAt", "id", "name", "position", "updatedAt") SELECT "category", "createdAt", "id", "name", "position", "updatedAt" FROM "RecruitmentCategory";
DROP TABLE "RecruitmentCategory";
ALTER TABLE "new_RecruitmentCategory" RENAME TO "RecruitmentCategory";
CREATE INDEX "RecruitmentCategory_category_position_idx" ON "RecruitmentCategory"("category", "position");
CREATE UNIQUE INDEX "RecruitmentCategory_category_name_key" ON "RecruitmentCategory"("category", "name");
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
    CONSTRAINT "Requisition_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Requisition_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Requisition_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Requisition" ("approvalChain", "approvalWorkflowId", "approvalWorkflowVersion", "approverId", "budget", "createdAt", "departmentId", "headcount", "hiringManagerId", "id", "status", "title", "updatedAt") SELECT "approvalChain", "approvalWorkflowId", "approvalWorkflowVersion", "approverId", "budget", "createdAt", "departmentId", "headcount", "hiringManagerId", "id", "status", "title", "updatedAt" FROM "Requisition";
DROP TABLE "Requisition";
ALTER TABLE "new_Requisition" RENAME TO "Requisition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "JobTitle_code_key" ON "JobTitle"("code");

-- CreateIndex
CREATE INDEX "JobTitleCompetencyFramework_frameworkId_idx" ON "JobTitleCompetencyFramework"("frameworkId");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

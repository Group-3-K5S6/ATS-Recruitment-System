-- AlterTable
ALTER TABLE "Job" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "approvedById" TEXT;
ALTER TABLE "Job" ADD COLUMN "approvalNotes" TEXT;
ALTER TABLE "Job" ADD COLUMN "publishedAt" DATETIME;
ALTER TABLE "Job" ADD COLUMN "publishedById" TEXT;
ALTER TABLE "Job" ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE INDEX "Job_approvedById_idx" ON "Job"("approvedById");
CREATE INDEX "Job_publishedById_idx" ON "Job"("publishedById");
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- S3-10 RBAC PERMISSION BACKFILL

INSERT INTO "Permission" ("id","code","module","description")
SELECT lower(hex(randomblob(16))), 'jobs:approve', 'jobs',
       'Duyet va tu choi tin tuyen dung'
WHERE NOT EXISTS (
    SELECT 1 FROM "Permission" WHERE "code"='jobs:approve'
);

INSERT INTO "Permission" ("id","code","module","description")
SELECT lower(hex(randomblob(16))), 'jobs:publish', 'jobs',
       'Xuat ban va go tin tuyen dung'
WHERE NOT EXISTS (
    SELECT 1 FROM "Permission" WHERE "code"='jobs:publish'
);

INSERT OR IGNORE INTO "RolePermission" ("roleId","permissionId")
SELECT r."id", p."id"
FROM "Role" r
JOIN "Permission" p
  ON p."code" IN ('jobs:approve','jobs:publish')
WHERE r."name" IN ('HR_MANAGER','ADMIN');

-- S3-10 GENERATED JOB FK REPAIR
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "workMode" TEXT DEFAULT 'ONSITE',
    "applicationDeadline" DATETIME,
    "showSalary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "approvalNotes" TEXT,
    "publishedAt" DATETIME,
    "publishedById" TEXT,
    "rejectionReason" TEXT,
    CONSTRAINT "Job_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_hiringManagerId_fkey" FOREIGN KEY ("hiringManagerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Job_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Job_jobTitleId_fkey" FOREIGN KEY ("jobTitleId") REFERENCES "JobTitle" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("applicationDeadline", "approvalNotes", "approvedAt", "approvedById", "createdAt", "departmentId", "description", "hiringManagerId", "id", "jobTitleId", "location", "publishedAt", "publishedById", "recruiterId", "rejectionReason", "requisitionId", "showSalary", "status", "title", "updatedAt", "workMode") SELECT "applicationDeadline", "approvalNotes", "approvedAt", "approvedById", "createdAt", "departmentId", "description", "hiringManagerId", "id", "jobTitleId", "location", "publishedAt", "publishedById", "recruiterId", "rejectionReason", "requisitionId", "showSalary", "status", "title", "updatedAt", "workMode" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE INDEX "Job_approvedById_idx" ON "Job"("approvedById");
CREATE INDEX "Job_publishedById_idx" ON "Job"("publishedById");
CREATE INDEX "Job_status_idx" ON "Job"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

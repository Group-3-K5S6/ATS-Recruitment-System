-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN "leadRecruiterId" TEXT;

-- CreateTable
CREATE TABLE "RequisitionSupportingRecruiter" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requisitionId" TEXT NOT NULL,
    "recruiterId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequisitionSupportingRecruiter_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RequisitionSupportingRecruiter_recruiterId_fkey" FOREIGN KEY ("recruiterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RequisitionAssignmentHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requisitionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "previousLeadRecruiterId" TEXT,
    "newLeadRecruiterId" TEXT,
    "supportingRecruiterIds" TEXT,
    "action" TEXT NOT NULL DEFAULT 'HANDOVER',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequisitionAssignmentHistory_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RequisitionAssignmentHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RequisitionAssignmentHistory_previousLeadRecruiterId_fkey" FOREIGN KEY ("previousLeadRecruiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RequisitionAssignmentHistory_newLeadRecruiterId_fkey" FOREIGN KEY ("newLeadRecruiterId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "RequisitionSupportingRecruiter_requisitionId_recruiterId_key" ON "RequisitionSupportingRecruiter"("requisitionId", "recruiterId");

-- CreateIndex
CREATE INDEX "RequisitionSupportingRecruiter_requisitionId_idx" ON "RequisitionSupportingRecruiter"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionSupportingRecruiter_recruiterId_idx" ON "RequisitionSupportingRecruiter"("recruiterId");

-- CreateIndex
CREATE INDEX "RequisitionAssignmentHistory_requisitionId_idx" ON "RequisitionAssignmentHistory"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionAssignmentHistory_actorId_idx" ON "RequisitionAssignmentHistory"("actorId");

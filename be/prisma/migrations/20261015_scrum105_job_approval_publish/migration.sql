-- AlterTable
ALTER TABLE "Job" ADD COLUMN "workMode" TEXT DEFAULT 'ONSITE';
ALTER TABLE "Job" ADD COLUMN "applicationDeadline" DATETIME;
ALTER TABLE "Job" ADD COLUMN "showSalary" BOOLEAN NOT NULL DEFAULT false;
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

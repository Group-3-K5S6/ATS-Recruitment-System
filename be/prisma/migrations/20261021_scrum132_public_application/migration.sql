-- SCRUM-132: Public job application & tracking
-- AlterTable
ALTER TABLE "Application" ADD COLUMN "trackingCode" TEXT;
ALTER TABLE "Application" ADD COLUMN "coverLetter" TEXT;
ALTER TABLE "Application" ADD COLUMN "source" TEXT;
ALTER TABLE "Application" ADD COLUMN "cvUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Application_trackingCode_key" ON "Application"("trackingCode");

-- CreateIndex
CREATE UNIQUE INDEX "Application_candidateId_jobId_key" ON "Application"("candidateId", "jobId");

-- CreateIndex
CREATE INDEX "Application_trackingCode_idx" ON "Application"("trackingCode");

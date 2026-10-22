-- S4-03: bổ sung trường an toàn, để NULL cho dữ liệu cũ
ALTER TABLE "Application" ADD COLUMN "trackingCode" TEXT;
ALTER TABLE "Application" ADD COLUMN "applicantEmailNormalized" TEXT;
ALTER TABLE "Application" ADD COLUMN "coverLetter" TEXT;
ALTER TABLE "Application" ADD COLUMN "source" TEXT;
ALTER TABLE "Application" ADD COLUMN "cvUrl" TEXT;
CREATE UNIQUE INDEX "Application_trackingCode_key" ON "Application"("trackingCode");
CREATE UNIQUE INDEX "Application_jobId_applicantEmailNormalized_key"
  ON "Application"("jobId", "applicantEmailNormalized");

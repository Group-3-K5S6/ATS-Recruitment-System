-- Sprint 2 new catalog + company images. Designed for databases that already
-- have the CompanyProfile table; do not run without a backup and schema check.
ALTER TABLE "CompanyProfile" ADD COLUMN "logoData" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "bannerData" TEXT;

CREATE TABLE "RecruitmentCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "RecruitmentCategory_category_name_key"
  ON "RecruitmentCategory"("category", "name");
CREATE INDEX "RecruitmentCategory_category_position_idx"
  ON "RecruitmentCategory"("category", "position");

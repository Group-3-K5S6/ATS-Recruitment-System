CREATE TABLE "RecruitmentCatalogItem" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RecruitmentCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruitmentCatalogItem_category_name_key" ON "RecruitmentCatalogItem"("category", "name");
CREATE INDEX "RecruitmentCatalogItem_category_isActive_sortOrder_idx" ON "RecruitmentCatalogItem"("category", "isActive", "sortOrder");

ALTER TABLE "Application"
    ADD COLUMN "sourceCatalogId" TEXT,
    ADD COLUMN "rejectionReasonCatalogId" TEXT;

CREATE INDEX "Application_sourceCatalogId_idx" ON "Application"("sourceCatalogId");
CREATE INDEX "Application_rejectionReasonCatalogId_idx" ON "Application"("rejectionReasonCatalogId");

ALTER TABLE "Application"
    ADD CONSTRAINT "Application_sourceCatalogId_fkey"
    FOREIGN KEY ("sourceCatalogId") REFERENCES "RecruitmentCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    ADD CONSTRAINT "Application_rejectionReasonCatalogId_fkey"
    FOREIGN KEY ("rejectionReasonCatalogId") REFERENCES "RecruitmentCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

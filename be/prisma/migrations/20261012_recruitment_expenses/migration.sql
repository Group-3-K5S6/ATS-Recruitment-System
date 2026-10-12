CREATE TABLE "RecruitmentExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requisitionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "occurredAt" DATETIME NOT NULL,
    "vendor" TEXT,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecruitmentExpense_requisitionId_fkey"
      FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecruitmentExpense_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RecruitmentExpense_requisitionId_occurredAt_idx"
  ON "RecruitmentExpense"("requisitionId", "occurredAt");
CREATE INDEX "RecruitmentExpense_category_occurredAt_idx"
  ON "RecruitmentExpense"("category", "occurredAt");

-- S3-04: salary budget by department/year, independent of headcount.
-- This migration MUST be tested on a disposable DB before any main DB update.
CREATE TABLE "DepartmentSalaryBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "amountVnd" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepartmentSalaryBudget_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DepartmentSalaryBudget_departmentId_year_key" ON "DepartmentSalaryBudget"("departmentId", "year");
CREATE INDEX "DepartmentSalaryBudget_year_idx" ON "DepartmentSalaryBudget"("year");

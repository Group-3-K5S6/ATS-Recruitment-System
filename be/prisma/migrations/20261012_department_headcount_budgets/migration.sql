CREATE TABLE "DepartmentHeadcountBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "headcount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DepartmentHeadcountBudget_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DepartmentHeadcountBudget_departmentId_year_key"
  ON "DepartmentHeadcountBudget"("departmentId", "year");
CREATE INDEX "DepartmentHeadcountBudget_year_idx"
  ON "DepartmentHeadcountBudget"("year");

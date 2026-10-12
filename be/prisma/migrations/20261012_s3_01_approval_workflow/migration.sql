-- AlterTable
ALTER TABLE "Requisition" ADD COLUMN "approvalChain" TEXT;
ALTER TABLE "Requisition" ADD COLUMN "approvalWorkflowId" TEXT;
ALTER TABLE "Requisition" ADD COLUMN "approvalWorkflowVersion" INTEGER;

-- CreateTable
CREATE TABLE "ApprovalWorkflow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "departmentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalWorkflow_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalWorkflowRange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowId" TEXT NOT NULL,
    "minSalary" REAL NOT NULL,
    "maxSalary" REAL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "approverIds" TEXT NOT NULL,
    CONSTRAINT "ApprovalWorkflowRange_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "ApprovalWorkflow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ApprovalWorkflow_departmentId_isActive_idx" ON "ApprovalWorkflow"("departmentId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalWorkflow_departmentId_version_key" ON "ApprovalWorkflow"("departmentId", "version");

-- CreateIndex
CREATE INDEX "ApprovalWorkflowRange_workflowId_idx" ON "ApprovalWorkflowRange"("workflowId");

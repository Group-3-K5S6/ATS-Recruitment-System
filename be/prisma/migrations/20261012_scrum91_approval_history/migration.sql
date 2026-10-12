-- CreateTable
CREATE TABLE "RequisitionApprovalHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requisitionId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL,
    "toStatus" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequisitionApprovalHistory_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RequisitionApprovalHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RequisitionApprovalHistory_requisitionId_idx" ON "RequisitionApprovalHistory"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionApprovalHistory_actorId_idx" ON "RequisitionApprovalHistory"("actorId");

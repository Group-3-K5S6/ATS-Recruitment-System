CREATE TABLE "ApplicationWithdrawalToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "applicationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApplicationWithdrawalToken_applicationId_fkey"
      FOREIGN KEY ("applicationId") REFERENCES "Application" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ApplicationWithdrawalToken_tokenHash_key"
  ON "ApplicationWithdrawalToken"("tokenHash");
CREATE INDEX "ApplicationWithdrawalToken_applicationId_expiresAt_idx"
  ON "ApplicationWithdrawalToken"("applicationId", "expiresAt");

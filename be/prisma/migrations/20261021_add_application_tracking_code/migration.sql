-- Migration Proposal: Add trackingCode to Application model
-- Description: Adds a unique, non-guessable trackingCode column to the Application table.
-- Note: Do NOT execute this migration on shared or staging databases without change approval.

-- Step 1: Add trackingCode column to Application table
ALTER TABLE "Application" ADD COLUMN "trackingCode" TEXT;

-- Step 2: Create a unique index on trackingCode for rapid lookups and collision prevention
CREATE UNIQUE INDEX "Application_trackingCode_key" ON "Application"("trackingCode");

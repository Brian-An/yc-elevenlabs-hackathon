/*
  Warnings:

  - You are about to drop the column `reviewClaim` on the `DateSession` table. All the data in the column will be lost.
  - You are about to drop the column `reviewClaimedAt` on the `DateSession` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DateSession" DROP COLUMN "reviewClaim",
DROP COLUMN "reviewClaimedAt",
ADD COLUMN     "replyCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reviewScores" JSONB,
ADD COLUMN     "turnCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReviewJob" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "transcriptHash" TEXT NOT NULL,
    "rubricVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "failureClass" TEXT,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ReviewJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReviewJob_status_runAfter_idx" ON "ReviewJob"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewJob_sessionId_transcriptHash_rubricVersion_key" ON "ReviewJob"("sessionId", "transcriptHash", "rubricVersion");

-- AddForeignKey
ALTER TABLE "ReviewJob" ADD CONSTRAINT "ReviewJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the history columns. Dates still waiting for a review get a ReviewJob from the sweep,
-- which computes the transcript hash the same way new jobs do.
UPDATE "DateSession"
SET "turnCount" = jsonb_array_length("transcript"),
    "replyCount" = (SELECT count(*) FROM jsonb_array_elements("transcript") AS turn WHERE turn->>'speaker' = 'user');

UPDATE "DateSession"
SET "reviewScores" = jsonb_build_object(
    'scores', COALESCE((
        SELECT jsonb_object_agg(skill.key, skill.value->'score')
        FROM jsonb_each("review"->'skills') AS skill
        WHERE jsonb_typeof(skill.value->'score') = 'number'
    ), '{}'::jsonb),
    'overallScore', "review"->'overallScore',
    'rubricVersion', "review"->'rubricVersion'
)
WHERE "review" IS NOT NULL;

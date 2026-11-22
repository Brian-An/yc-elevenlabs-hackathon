BEGIN;

ALTER TABLE "Move" ADD COLUMN "inputHash" TEXT NOT NULL DEFAULT '';

DROP INDEX "Move_sessionId_turnIndex_key";
CREATE UNIQUE INDEX "Move_sessionId_turnIndex_inputHash_key" ON "Move"("sessionId", "turnIndex", "inputHash");

COMMIT;

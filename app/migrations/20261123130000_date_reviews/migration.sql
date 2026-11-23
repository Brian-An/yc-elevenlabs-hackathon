ALTER TABLE "DateSession"
    ADD COLUMN "kind" TEXT,
    ADD COLUMN "source" TEXT,
    ADD COLUMN "review" JSONB,
    ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN "reviewClaim" TEXT,
    ADD COLUMN "reviewClaimedAt" TIMESTAMP(3),
    ADD COLUMN "coachSourceSessionId" TEXT;

-- Historic sessions have no reliable record of whether their transcript came from a replay.
UPDATE "DateSession"
SET "kind" = CASE WHEN "personaId" = 'coach' THEN 'coaching' ELSE 'date' END,
    "source" = 'legacy',
    "reviewStatus" = CASE WHEN "status" = 'evaluated' THEN 'legacy' ELSE 'none' END;

ALTER TABLE "DateSession"
    ALTER COLUMN "kind" SET NOT NULL,
    ALTER COLUMN "source" SET NOT NULL;

CREATE INDEX "DateSession_userId_kind_source_reviewStatus_endedAt_idx"
ON "DateSession" ("userId", "kind", "source", "reviewStatus", "endedAt");

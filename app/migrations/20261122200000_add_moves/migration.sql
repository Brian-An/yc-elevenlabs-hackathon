-- CreateTable
CREATE TABLE "Move" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "turnIndex" INTEGER NOT NULL,
    "classification" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "scores" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Move_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Move_sessionId_turnIndex_key" ON "Move"("sessionId", "turnIndex");

-- AddForeignKey
ALTER TABLE "Move" ADD CONSTRAINT "Move_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DateSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

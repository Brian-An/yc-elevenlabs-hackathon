-- AlterTable
ALTER TABLE "DateSession" ADD COLUMN     "userContext" TEXT;

-- CreateTable
CREATE TABLE "PersonaCallback" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "sourceSessionId" TEXT NOT NULL,
    "usedInSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaCallback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonaCallback_userId_personaId_key" ON "PersonaCallback"("userId", "personaId");

-- AddForeignKey
ALTER TABLE "PersonaCallback" ADD CONSTRAINT "PersonaCallback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

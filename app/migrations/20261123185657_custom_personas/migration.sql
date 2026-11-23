-- CreateTable
CREATE TABLE "CustomPersona" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "bio" TEXT NOT NULL,
    "personality" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "setting" TEXT NOT NULL,
    "openingLine" TEXT NOT NULL,
    "appearance" TEXT NOT NULL,
    "look" JSONB NOT NULL,
    "voiceId" TEXT,
    "voiceName" TEXT,
    "avatarId" TEXT,
    "provenance" JSONB NOT NULL,
    "notes" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomPersona_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvatarProfile" (
    "avatarId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "previewUrl" TEXT NOT NULL,
    "gender" TEXT,
    "ageRange" TEXT,
    "description" TEXT,
    "taggedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvatarProfile_pkey" PRIMARY KEY ("avatarId")
);

-- CreateIndex
CREATE INDEX "CustomPersona_userId_deletedAt_createdAt_idx" ON "CustomPersona"("userId", "deletedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "CustomPersona" ADD CONSTRAINT "CustomPersona_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

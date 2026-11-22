/*
  Warnings:

  - The primary key for the `User` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `Auth` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `AuthIdentity` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Session` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Auth" DROP CONSTRAINT "Auth_userId_fkey";

-- DropForeignKey
ALTER TABLE "AuthIdentity" DROP CONSTRAINT "AuthIdentity_authId_fkey";

-- DropForeignKey
ALTER TABLE "DateSession" DROP CONSTRAINT "DateSession_userId_fkey";

-- DropForeignKey
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";

-- DropForeignKey
ALTER TABLE "UserMemory" DROP CONSTRAINT "UserMemory_userId_fkey";

-- AlterTable
ALTER TABLE "DateSession" ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "User_id_seq";

-- AlterTable
ALTER TABLE "UserMemory" ALTER COLUMN "userId" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "Auth";

-- DropTable
DROP TABLE "AuthIdentity";

-- DropTable
DROP TABLE "Session";

-- AddForeignKey
ALTER TABLE "DateSession" ADD CONSTRAINT "DateSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

// Persona callbacks: one detail per user + persona, carried from one date into the next.
import type { Prisma } from "@prisma/client";
import { prisma } from "wasp/server";
import type { Transcript } from "../shared/types";
import { extractCallback } from "./callbackExtract";

/** The detail the next date with this persona should follow up on, if any. */
export async function pendingCallback(userId: string, personaId: string): Promise<string | null> {
  const row = await prisma.personaCallback.findUnique({ where: { userId_personaId: { userId, personaId } } });
  if (!row || row.usedInSessionId) return null;
  const source = await prisma.dateSession.findFirst({
    where: { id: row.sourceSessionId, userId, personaId, kind: "date", source: "live" },
    select: { id: true },
  });
  return source ? row.detail : null;
}

/**
 * After a date ends: mark the callback this date was given as used, then save a new one
 * if the user shared something worth following up on. If they didn't, nothing is saved.
 */
export async function updateCallbacks(session: {
  id: string;
  userId: string;
  personaId: string;
  userContext: string | null;
  transcript: Transcript;
  startedAt: Date;
}, tx: Prisma.TransactionClient): Promise<string | null> {
  const where = { userId_personaId: { userId: session.userId, personaId: session.personaId } };
  // Concurrent dates can finish in a different order from when the user met the persona.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.userId} FOR UPDATE`;
  const previous = await tx.personaCallback.findUnique({ where });
  if (previous) {
    const source = await tx.dateSession.findUnique({ where: { id: previous.sourceSessionId }, select: { startedAt: true } });
    if (source && source.startedAt > session.startedAt) return null;
  }
  if (session.userContext) {
    await tx.personaCallback.updateMany({
      where: { userId: session.userId, personaId: session.personaId, detail: session.userContext, usedInSessionId: null, createdAt: { lte: session.startedAt } },
      data: { usedInSessionId: session.id },
    });
  }
  const detail = extractCallback(session.transcript);
  if (!detail) return null;
  await tx.personaCallback.upsert({
    where,
    create: { userId: session.userId, personaId: session.personaId, detail, sourceSessionId: session.id },
    update: { detail, sourceSessionId: session.id, usedInSessionId: null, createdAt: new Date() },
  });
  return detail;
}

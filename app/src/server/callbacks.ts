// Persona callbacks: one detail per user + persona, carried from one date into the next.
import { prisma } from "wasp/server";
import type { Transcript } from "../shared/types";
import { extractCallback } from "./callbackExtract";

/** The detail the next date with this persona should follow up on, if any. */
export async function pendingCallback(userId: string, personaId: string): Promise<string | null> {
  const row = await prisma.personaCallback.findUnique({ where: { userId_personaId: { userId, personaId } } });
  return row && !row.usedInSessionId ? row.detail : null;
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
}): Promise<string | null> {
  const where = { userId_personaId: { userId: session.userId, personaId: session.personaId } };
  if (session.userContext) {
    await prisma.personaCallback.updateMany({
      where: { userId: session.userId, personaId: session.personaId, detail: session.userContext, usedInSessionId: null },
      data: { usedInSessionId: session.id },
    });
  }
  const detail = extractCallback(session.transcript);
  if (!detail) return null;
  await prisma.personaCallback.upsert({
    where,
    create: { userId: session.userId, personaId: session.personaId, detail, sourceSessionId: session.id },
    update: { detail, sourceSessionId: session.id, usedInSessionId: null, createdAt: new Date() },
  });
  return detail;
}

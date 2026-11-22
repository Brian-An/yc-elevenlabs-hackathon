// Move-by-move grading: each user turn of a date gets one Move row, graded by Jev.
// appendTranscript grades new turns as they are saved (its callers don't wait, so the voice call never does);
// saveTranscript regrades in the background; endDateSession awaits any turns still ungraded before scoring the date.
import { prisma } from "wasp/server";
import type { Move } from "wasp/entities";
import type { MoveClass, MoveEvaluation, Persona, Scenario, SkillName, Transcript } from "../shared/types";
import { gradeTurn, jevEnabled } from "./jev";
import { readJson } from "./serialize";

// Shares one Jev call per turn between the background grader and endDateSession.
const inflight = new Map<string, Promise<MoveEvaluation>>();

export function toMoveEvaluation(row: Move): MoveEvaluation {
  return {
    turnIndex: row.turnIndex,
    classification: row.classification as MoveClass,
    confidence: row.confidence,
    scores: readJson<Record<SkillName, number>>(row.scores, { listening: 0, engagement: 0, confidence: 0, flow: 0 }),
  };
}

function gradeAndSave(
  sessionId: string,
  transcript: Transcript,
  turnIndex: number,
  scenario: Scenario,
  persona: Persona,
): Promise<MoveEvaluation> {
  // Keyed by text too, so a replaced transcript never reuses a grade for different words.
  const key = `${sessionId}:${turnIndex}:${transcript[turnIndex]?.text}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    const move = await gradeTurn(transcript, turnIndex, scenario, persona);
    const data = { classification: move.classification, confidence: move.confidence, scores: move.scores };
    await prisma.move.upsert({
      where: { sessionId_turnIndex: { sessionId, turnIndex } },
      create: { sessionId, turnIndex, ...data },
      update: data,
    });
    return move;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

/**
 * Grades every user turn that has no Move yet and returns all of the session's moves, in turn order.
 * Turns whose grading fails are logged and left out, so callers get whatever Jev could grade.
 */
export async function gradePendingMoves(
  sessionId: string,
  transcript: Transcript,
  scenario: Scenario,
  persona: Persona,
): Promise<MoveEvaluation[]> {
  if (!jevEnabled()) return [];
  const existing = await prisma.move.findMany({ where: { sessionId } });
  const graded = new Set(existing.map((m) => m.turnIndex));
  const pending = transcript.flatMap((t, i) => (t.speaker === "user" && !graded.has(i) ? [i] : []));

  const results = await Promise.allSettled(
    pending.map((i) => gradeAndSave(sessionId, transcript, i, scenario, persona)),
  );
  results.forEach((r, k) => {
    if (r.status === "rejected") console.error(`Jev grading failed for ${sessionId} turn ${pending[k]}:`, r.reason);
  });

  const fresh = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  return [...existing.map(toMoveEvaluation), ...fresh].sort((a, b) => a.turnIndex - b.turnIndex);
}

/** Fire-and-forget version for the live call path. */
export function gradePendingMovesInBackground(...args: Parameters<typeof gradePendingMoves>): void {
  gradePendingMoves(...args).catch((e) => console.error("Jev background grading failed:", e));
}

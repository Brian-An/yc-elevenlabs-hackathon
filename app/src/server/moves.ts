// Move-by-move grading: each user turn of a date gets one Move row, graded by Jev.
// appendTranscript grades new turns as they are saved (its callers don't wait, so the voice call never does);
// saveTranscript grades in the background; endDateSession waits for any missing grades.
import { createHash } from "node:crypto";
import { prisma } from "wasp/server";
import type { Move } from "wasp/entities";
import type { MoveClass, MoveEvaluation, Persona, Scenario, SkillName, Transcript } from "../shared/types";
import { buildGradeRequest, gradeTurn, jevEnabled } from "./jev";
import { readJson } from "./serialize";

// Shares one Jev call per turn between the background grader and endDateSession.
const inflight = new Map<string, Promise<MoveEvaluation>>();

function toMoveEvaluation(row: Move): MoveEvaluation {
  return {
    turnIndex: row.turnIndex,
    classification: row.classification as MoveClass,
    confidence: row.confidence,
    scores: readJson<Record<SkillName, number>>(row.scores, { listening: 0, engagement: 0, confidence: 0, flow: 0 }),
  };
}

function gradeInputs(
  transcript: Transcript,
  scenario: Scenario,
  persona: Persona,
) {
  return transcript.flatMap((turn, turnIndex) => {
    if (turn.speaker !== "user") return [];
    const body = buildGradeRequest(transcript, turnIndex, scenario, persona);
    return [{ turnIndex, body, inputHash: createHash("sha256").update(body).digest("hex") }];
  });
}

type GradeInput = ReturnType<typeof gradeInputs>[number];

function indexMoves(rows: Move[]): Map<string, Move> {
  return new Map(rows.map((row) => [`${row.turnIndex}:${row.inputHash}`, row]));
}

export function movesForTranscript(
  rows: Move[],
  transcript: Transcript,
  scenario: Scenario,
  persona: Persona,
  includeLegacy: boolean,
): MoveEvaluation[] {
  const indexed = indexMoves(rows);
  return gradeInputs(transcript, scenario, persona).flatMap(({ turnIndex, inputHash }) => {
    const row = indexed.get(`${turnIndex}:${inputHash}`)
      ?? (includeLegacy ? indexed.get(`${turnIndex}:`) : undefined);
    return row ? [toMoveEvaluation(row)] : [];
  });
}

function gradeAndSave(sessionId: string, { turnIndex, body, inputHash }: GradeInput): Promise<MoveEvaluation> {
  const identity = { sessionId, turnIndex, inputHash };
  const key = `${sessionId}:${turnIndex}:${inputHash}`;
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = (async () => {
    const where = { sessionId_turnIndex_inputHash: identity };
    const existing = await prisma.move.findUnique({ where });
    if (existing) return toMoveEvaluation(existing);

    const move = await gradeTurn(body, turnIndex);
    const { classification, confidence, scores } = move;
    const { count } = await prisma.move.createMany({
      data: { ...identity, classification, confidence, scores },
      skipDuplicates: true,
    });
    return count ? move : toMoveEvaluation(await prisma.move.findUniqueOrThrow({ where }));
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
  const inputs = gradeInputs(transcript, scenario, persona);
  if (!inputs.length) return [];
  const existing = indexMoves(await prisma.move.findMany({ where: { sessionId } }));

  const results = await Promise.allSettled(
    inputs.map((input) => {
      const row = existing.get(`${input.turnIndex}:${input.inputHash}`);
      return row ? toMoveEvaluation(row) : gradeAndSave(sessionId, input);
    }),
  );
  results.forEach((r, k) => {
    if (r.status === "rejected") console.error(`Jev grading failed for ${sessionId} turn ${inputs[k].turnIndex}:`, r.reason);
  });

  return results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
}

/** Fire-and-forget version for the live call path. */
export function gradePendingMovesInBackground(...args: Parameters<typeof gradePendingMoves>): void {
  gradePendingMoves(...args).catch((e) => console.error("Jev background grading failed:", e));
}

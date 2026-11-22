// Lines up the saved move grades (DateSessionDTO.moves) with the live call's transcript.
import type { MoveEvaluation, Transcript } from "../shared/types";

/** A grade, or "failed" when the reply was saved but Jev could not grade it. */
export type LiveMove = MoveEvaluation | "failed";

/**
 * Keys each user reply by its text and how many identical replies came before it, rather than by index:
 * the live transcript and the saved one share an order, but a turn whose save failed would shift every index after it.
 */
function replyKeys(transcript: Transcript): (string | null)[] {
  const seen = new Map<string, number>();
  return transcript.map((turn) => {
    if (turn.speaker !== "user") return null;
    const n = seen.get(turn.text) ?? 0;
    seen.set(turn.text, n + 1);
    return `${n}:${turn.text}`;
  });
}

/** Returns the grade for each user turn of `live`, by its index in `live`. Turns not saved yet have no entry. */
export function movesByTurn(
  live: Transcript,
  saved: Transcript,
  moves: MoveEvaluation[],
  gradingEnabled: boolean,
): ReadonlyMap<number, LiveMove> {
  const byIndex = new Map(moves.map((m) => [m.turnIndex, m]));
  const byKey = new Map<string, LiveMove>();
  // appendTranscript returns only after grading, so a saved reply without a grade failed.
  replyKeys(saved).forEach((key, i) => {
    if (!key) return;
    const move = byIndex.get(i);
    if (move) byKey.set(key, move);
    else if (gradingEnabled) byKey.set(key, "failed");
  });

  const result = new Map<number, LiveMove>();
  replyKeys(live).forEach((key, i) => {
    const move = key ? byKey.get(key) : undefined;
    if (move) result.set(i, move);
  });
  return result;
}

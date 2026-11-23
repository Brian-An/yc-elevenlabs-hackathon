import type { Transcript, TranscriptTurn } from "../shared/types";

/** Older clients send append-only turns; current clients can amend an utterance by sequence. */
export function mergeTurns(previous: Transcript, incoming: Transcript): Transcript {
  const bySequence = new Map<number, TranscriptTurn>();
  const unnumbered: Transcript = [];
  for (const turn of [...previous, ...incoming]) {
    if (turn.sequence === undefined) {
      unnumbered.push(turn);
      continue;
    }
    const saved = bySequence.get(turn.sequence);
    if (!saved || (turn.revision ?? 0) > (saved.revision ?? 0)) bySequence.set(turn.sequence, turn);
  }
  return [...unnumbered, ...[...bySequence].sort(([a], [b]) => a - b).map(([, turn]) => turn)];
}

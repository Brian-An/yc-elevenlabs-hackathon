import type { Speaker, Transcript, TranscriptTurn } from "../shared/types";

/** Provider event IDs are local to one connection. Sequence numbers belong to the saved date. */
export class CallTranscript {
  turns: Transcript;
  private nextSequence: number;
  private readonly positions = new Map<string, number>();
  private readonly drafts = new Map<Speaker, TranscriptTurn>();

  constructor(saved: Transcript) {
    this.turns = saved.map((turn, index) => ({ ...turn, sequence: turn.sequence ?? index, revision: turn.revision ?? 0 }));
    this.nextSequence = this.turns.reduce((next, turn) => Math.max(next, turn.sequence! + 1), 0);
  }

  reconnect() {
    this.positions.clear();
    this.drafts.clear();
  }

  chunk(speaker: Speaker, text: string, timestamp: number, cumulative: boolean) {
    const draft = this.drafts.get(speaker);
    this.drafts.set(speaker, {
      speaker, timestamp: draft?.timestamp ?? timestamp,
      text: cumulative || !draft ? text : draft.text + text,
    });
    return this.display();
  }

  display(): Transcript {
    return [...this.turns, ...this.drafts.values()];
  }

  finish(turn: TranscriptTurn, eventIds: string[] = [], correctionOnly = false): TranscriptTurn | null {
    const draft = this.drafts.get(turn.speaker);
    this.drafts.delete(turn.speaker);
    const keys = eventIds.map((id) => `${turn.speaker}:${id}`);
    const position = keys.map((key) => this.positions.get(key)).find((index) => index !== undefined);
    if (correctionOnly && position === undefined) return null;
    if (position !== undefined) {
      const previous = this.turns[position];
      if (previous.text === turn.text) return null;
      const corrected = { ...previous, text: turn.text, revision: (previous.revision ?? 0) + 1 };
      this.turns = this.turns.map((item, index) => index === position ? corrected : item);
      return corrected;
    }
    const final = { ...turn, timestamp: draft?.timestamp ?? turn.timestamp, sequence: this.nextSequence++, revision: 0 };
    keys.forEach((key) => this.positions.set(key, this.turns.length));
    this.turns = [...this.turns, final];
    return final;
  }
}

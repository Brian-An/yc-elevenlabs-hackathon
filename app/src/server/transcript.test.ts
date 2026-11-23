import { describe, expect, it } from "vitest";
import { mergeTurns } from "./transcript";
import type { TranscriptTurn } from "../shared/types";

describe("mergeTurns", () => {
  const turn = (sequence: number, revision: number, text: string): TranscriptTurn => ({ sequence, revision, text, speaker: "user", timestamp: 5 });
  it("puts out-of-order appends in call order and accepts only a newer revision", () => {
    const old = turn(1, 0, "first draft");
    const latest = turn(1, 2, "corrected");
    const opening = turn(0, 0, "hello");
    expect(mergeTurns([old], [latest, opening, old, latest])).toEqual([opening, latest]);
  });
  it("retains the order of older clients' append-only turns", () => {
    const first = { speaker: "user", text: "hi", timestamp: 2 } as const;
    expect(mergeTurns([first], [first, turn(2, 0, "yes")])).toEqual([first, first, turn(2, 0, "yes")]);
  });
});

import { describe, expect, it } from "vitest";
import { movesByTurn, type LiveMove } from "./liveMoves";
import type { MoveClass, MoveEvaluation, Transcript } from "../shared/types";

const t = (...lines: [("user" | "agent"), string][]): Transcript =>
  lines.map(([speaker, text], i) => ({ speaker, text, timestamp: i * 1000 }));

const move = (turnIndex: number, classification: MoveClass): MoveEvaluation => ({
  turnIndex,
  classification,
  confidence: 0.8,
  scores: { listening: 5, engagement: 5, confidence: 5, flow: 5 },
});

const labels = (moves: ReadonlyMap<number, LiveMove>) =>
  Object.fromEntries([...moves].map(([i, m]) => [i, m === "failed" ? m : m.classification]));

describe("movesByTurn", () => {
  it("matches grades to live turns when a save was dropped and replies repeat", () => {
    const live = t(["agent", "a1"], ["user", "yeah"], ["agent", "a2"], ["user", "yeah"], ["user", "cool"], ["user", "not saved yet"]);
    // a2 never saved, so every saved index after it is one lower than the live one.
    const saved = [live[0], live[1], live[3], live[4]];
    expect(labels(movesByTurn(live, saved, [move(1, "good"), move(2, "mistake")], true))).toEqual({
      1: "good",
      3: "mistake",
      4: "failed",
    });
  });

  it("shows nothing when the server does not grade replies", () => {
    const live = t(["agent", "hi"], ["user", "hey"]);
    expect(movesByTurn(live, live, [], false).size).toBe(0);
  });
});

it("distinguishes identical replies by utterance and suppresses grades from an older revision", () => {
  const live: Transcript = [0, 1, 2].map((sequence) => ({
    speaker: "user", text: "Yeah.", sequence, revision: sequence === 1 ? 1 : 0, timestamp: sequence,
  }));
  const saved = [{ ...live[1], revision: 0 }, live[2]];
  expect(labels(movesByTurn(live, saved, [move(0, "mistake"), move(1, "good")], true))).toEqual({ 2: "good" });
});

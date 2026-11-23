import { describe, expect, it } from "vitest";
import { CallTranscript } from "./callTranscript";

describe("live transcript", () => {
  it("preserves distinct consecutive final turns and associates each draft with its speaker", () => {
    const log = new CallTranscript([]);
    log.chunk("agent", "Hi", 10, false);
    log.chunk("user", "Oh", 15, true);
    const a = log.finish({ speaker: "agent", text: "Hi!", timestamp: 20 }, ["a"]);
    const b = log.finish({ speaker: "agent", text: "What happened?", timestamp: 30 }, ["b"]);
    expect([a?.sequence, b?.sequence]).toEqual([0, 1]);
    expect(log.display().map((turn) => turn.text)).toEqual(["Hi!", "What happened?", "Oh"]);
    expect(log.turns.map((turn) => turn.timestamp)).toEqual([10, 30]);
  });

  it("deduplicates events, revises the original turn in place, and resumes at the saved sequence", () => {
    const log = new CallTranscript([{ speaker: "user", text: "No", sequence: 4, timestamp: 4 }]);
    const turn = { speaker: "agent" as const, text: "Okay.", timestamp: 5 };
    expect(log.finish(turn, ["response-a"])).toMatchObject({ sequence: 5, revision: 0 });
    expect(log.finish(turn, ["response-a"])).toBeNull();
    expect(log.finish({ ...turn, text: "Okay, sure." }, ["response-a"], true)).toMatchObject({ sequence: 5, revision: 1 });
    log.reconnect();
    expect(log.finish(turn, ["response-a"])).toMatchObject({ sequence: 6, revision: 0 });
    expect(log.turns).toHaveLength(3);
  });
});

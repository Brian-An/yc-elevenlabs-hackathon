import { describe, expect, it, vi } from "vitest";
import { getMemory } from "./memory";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("wasp/server", () => ({ prisma: { userMemory: { findUnique } } }));

describe("reviewed date progress", () => {
  it("excludes unverified history and averages only observed skills", async () => {
    findUnique.mockResolvedValue({
      trainingFocus: "confidence", sessionsCount: 3,
      skillHistory: [
        { sessionId: "legacy", scores: { confidence: 1 } },
        { sessionId: "first", rubricVersion: "1", scores: { engagement: 7 } },
        { sessionId: "second", rubricVersion: "1", scores: { listening: 8, engagement: 5 } },
      ],
      strengths: [{ point: "Legacy", sessionId: "legacy" }, { point: "Listening", sessionId: "second" }],
      weaknesses: [],
    });
    const memory = await getMemory("user");
    expect(memory.sessionsCount).toBe(2);
    expect(memory.skillProfile).toEqual({ listening: 0.8, engagement: 0.6 });
    expect(memory.trainingFocus).toBe("engagement");
    expect(memory.strengths.map((point) => point.point)).toEqual(["Listening"]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemorySnapshot } from "./dto";
import type { Evaluation } from "../shared/types";
import { saveMemory } from "./memory";

const { upsert } = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("wasp/server", () => ({ prisma: { userMemory: { findUnique: async () => null, upsert } } }));

beforeEach(() => {
  upsert.mockReset();
  upsert.mockImplementation(async ({ create }) => create);
});

describe("saved coaching memory", () => {
  it("keeps tied skill labels aligned with the evaluation's stable ranking", async () => {
    const evaluation: Evaluation = {
      scores: { listening: 9, engagement: 9, confidence: 7, flow: 10 },
      strengths: [{ point: "Flow strength", quote: "" }, { point: "Listening strength", quote: "" }],
      weaknesses: [{ point: "Confidence weakness", quote: "" }],
      summary: "Practice confidence.",
    };
    const memory: MemorySnapshot = await saveMemory("user", evaluation, { sessionId: "session", personaId: "maya" });
    expect(memory.strengths.map((point) => point.skill)).toEqual(["flow", "listening"]);
    expect(memory.weaknesses[0].skill).toBe("confidence");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Persona, Scenario, Transcript } from "../shared/types";
import { buildGradeRequest, gradeTurn } from "./jev";

const persona: Persona = { id: "maya", name: "Maya", age: 25, bio: "", personality: "" };
const scenario: Scenario = { id: "cafe", personaId: "maya", difficulty: "easy", setting: "café" };
const transcript: Transcript = [
  { speaker: "agent", text: "I tried pottery last weekend.", timestamp: 100 },
  { speaker: "user", text: "What did you make?", timestamp: 200 },
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Jev grade inputs", () => {
  it("reuses identical dialogue across transcript snapshots and ignores callback timestamps", () => {
    const original = buildGradeRequest(transcript, 1, scenario, persona);
    const final = [
      ...transcript.map((turn) => ({ ...turn, timestamp: turn.timestamp + 1000 })),
      { speaker: "agent", text: "A bowl!", timestamp: 2000 } as const,
    ];
    expect(buildGradeRequest(final, 1, scenario, persona)).toBe(original);
    expect(JSON.parse(original).state).not.toHaveProperty("secondsToReply");
  });

  it("detects a changed preceding turn even if the reply is unchanged", () => {
    const corrected = [{ ...transcript[0], text: "I tried woodworking last weekend." }, transcript[1]];
    expect(buildGradeRequest(corrected, 1, scenario, persona)).not.toBe(buildGradeRequest(transcript, 1, scenario, persona));
  });
});

function mockJev(score: unknown = 2, highConfidence = false) {
  const skill = { type: "score", score };
  const answers = {
    move: {
      type: "choice",
      choice: "mistake",
      probabilities: { great: 0, good: 0, neutral: 0.3, inaccuracy: 0.2, mistake: highConfidence ? 0.7 : 0.45, blunder: 0.05 },
    },
    listening: skill,
    engagement: skill,
    confidence: skill,
    flow: skill,
  };
  vi.stubEnv("TYPESAFE_API_KEY", "test-key");
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ answers })));
}

describe("Jev grades", () => {
  it("shows a neutral badge for uncertain harsh verdicts", async () => {
    mockJev();
    await expect(gradeTurn("{}", 1)).resolves.toMatchObject({
      classification: "neutral",
      confidence: 0.3,
      decision: { rawLabel: "mistake", probabilities: { mistake: 0.45, neutral: 0.3 } },
      scores: { listening: 5.5 },
    });
  });

  it("retains a confident harsh verdict", async () => {
    mockJev(2, true);
    await expect(gradeTurn("{}", 1)).resolves.toMatchObject({ classification: "mistake" });
  });

  it.each([null, "2", -1, 5])("rejects invalid rubric scores (%s)", async (score) => {
    mockJev(score);
    await expect(gradeTurn("{}", 1)).rejects.toThrow("invalid listening score");
  });
});

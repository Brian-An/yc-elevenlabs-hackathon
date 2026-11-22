import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Move } from "wasp/entities";
import type { MoveClass, Transcript } from "../shared/types";
import { gradePendingMoves, movesForTranscript } from "./moves";
import { getPersona } from "./personas";

const { rows, gradeTurn } = vi.hoisted(() => ({
  rows: [] as Move[],
  gradeTurn: vi.fn(),
}));

vi.mock("wasp/server", () => ({
  prisma: {
    move: {
      findMany: async () => [...rows],
      findUnique: async () => null,
      createMany: async ({ data }: { data: Omit<Move, "id" | "createdAt"> }) => {
        rows.push({ ...data, id: String(rows.length), createdAt: new Date() });
        return { count: 1 };
      },
    },
  },
}));

vi.mock("./jev", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./jev")>()),
  gradeTurn,
  jevEnabled: () => true,
}));

const persona = getPersona("maya")!;
const scenario = persona.defaultScenario;
const live: Transcript = [
  { speaker: "agent", text: "I made a mug in pottery class.", timestamp: 0 },
  { speaker: "user", text: "What did you use to make it?", timestamp: 1500 },
];
const corrected = [{ ...live[0], text: "I made a cake in baking class." }, live[1]];
const scores = { listening: 7, engagement: 7, confidence: 7, flow: 7 };

beforeEach(() => {
  rows.length = 0;
  gradeTurn.mockReset();
  gradeTurn.mockImplementation(async (body: string, turnIndex: number) => {
    const classification: MoveClass = body.includes("pottery") ? "great" : "good";
    return { classification, turnIndex, confidence: 0.9, scores };
  });
});

describe("saved Jev grades", () => {
  it("shares an in-flight request and reuses the saved grade at hang-up", async () => {
    const final = [...live, { speaker: "agent", text: "Clay!", timestamp: 2000 } as const];
    const [liveGrades, finalGrades] = await Promise.all([
      gradePendingMoves("session", live, scenario, persona),
      gradePendingMoves("session", final, scenario, persona),
    ]);
    expect(finalGrades).toEqual(liveGrades);
    expect(await gradePendingMoves("session", final, scenario, persona)).toEqual(liveGrades);
    expect(gradeTurn).toHaveBeenCalledTimes(1);
  });

  it("keeps a stale grade from replacing the grade for corrected context", async () => {
    const stale = Promise.withResolvers<{ classification: MoveClass; turnIndex: number; confidence: number; scores: typeof scores }>();
    gradeTurn.mockImplementationOnce(() => stale.promise);
    const oldRequest = gradePendingMoves("session", live, scenario, persona);
    await vi.waitFor(() => expect(gradeTurn).toHaveBeenCalledTimes(1));

    const finalGrades = await gradePendingMoves("session", corrected, scenario, persona);
    stale.resolve({ classification: "great", turnIndex: 1, confidence: 0.9, scores });
    await oldRequest;

    expect(finalGrades[0].classification).toBe("good");
    expect(movesForTranscript(rows, corrected, scenario, persona, false)).toEqual(finalGrades);
    expect(movesForTranscript(rows, live, scenario, persona, false)[0].classification).toBe("great");
    expect(gradeTurn).toHaveBeenCalledTimes(2);
  });

  it("can display legacy grades for finished dates without reusing them for scoring", async () => {
    rows.push({
      id: "legacy", sessionId: "session", turnIndex: 1, inputHash: "",
      classification: "neutral", confidence: 0.9, scores, createdAt: new Date(),
    });
    expect(movesForTranscript(rows, live, scenario, persona, true)[0].classification).toBe("neutral");
    expect(movesForTranscript(rows, live, scenario, persona, false)).toEqual([]);
    expect((await gradePendingMoves("session", live, scenario, persona))[0].classification).toBe("great");
    expect(gradeTurn).toHaveBeenCalledTimes(1);
  });
});

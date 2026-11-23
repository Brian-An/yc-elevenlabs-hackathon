import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DateReview } from "../shared/dateReview";
import { resolveCallSession } from "./sessionBrief";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("wasp/server", () => ({ prisma: { dateSession: { findFirst } }, HttpError: Error }));

const userId = "1cb1c790-ce85-4ade-a3e3-0f79d7acc7a8";
const startedAt = new Date("2026-11-22T22:00:00Z");
const session = { personaId: "coach", source: "live", status: "active", startedAt, scenario: {},
  coachSourceSessionId: "picked-date", userContext: "Private callback", user: { goals: "Follow up" } };
const skill = { score: null, turnIndices: [] };
const review: DateReview = {
  summary: "You returned to the story.", strengths: [], weaknesses: [], moments: [],
  skills: { listening: skill, confidence: skill, engagement: skill, flow: skill },
  overallScore: null, model: "test", rubricVersion: "test", transcriptHash: "hash",
  practice: { skill: "listening", agentTurnIndex: 0, userTurnIndex: 1, instruction: "Ask what the gift meant.", exampleReply: "What was the occasion?" },
};
const previous = { personaId: "maya", endedAt: startedAt, review, transcript: [
  { speaker: "agent", text: "My sister's mug broke.", timestamp: 0 }, { speaker: "user", text: "Ouch.", timestamp: 1 },
  { speaker: "user", text: "Unrelated private details", timestamp: 2 },
] };

beforeEach(() => {
  findFirst.mockReset();
  vi.stubEnv("ELEVENLABS_AGENT_ID", "agent");
});

describe("session context", () => {
  it("grounds Riley in the selected user's reviewed practice date and original lines", async () => {
    findFirst.mockResolvedValueOnce(session).mockResolvedValueOnce(previous);
    const call = await resolveCallSession("call-id", userId);
    if ("error" in call) throw Error(call.error);
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "call-id", userId });
    expect(findFirst.mock.calls[1][0].where).toEqual({ id: "picked-date", userId, status: "evaluated", kind: "date",
      source: "live", reviewStatus: "ready", endedAt: { lte: startedAt } });
    expect(call.dynamicVariables.opening_line).toContain("My sister's mug broke.");
    const brief = JSON.parse(call.dynamicVariables.session_context);
    expect(brief.reviewedDate.practice).toMatchObject({ dateSaid: "My sister's mug broke.", youReplied: "Ouch.", suggestedReply: "What was the occasion?" });
    expect(JSON.stringify(call)).not.toMatch(/Unrelated private details|Private callback/);
  });

  it("loads the most recent review without a selection and handles the first coaching chat", async () => {
    findFirst.mockResolvedValueOnce({ ...session, coachSourceSessionId: null }).mockResolvedValueOnce(null);
    const call = await resolveCallSession("call-id", userId);
    expect(findFirst.mock.calls[1][0].where).not.toHaveProperty("id");
    expect(findFirst.mock.calls[1][0].orderBy).toEqual([{ endedAt: "desc" }, { id: "desc" }]);
    if ("error" in call) throw Error(call.error);
    expect(JSON.parse(call.dynamicVariables.session_context)).toEqual({ goal: "Follow up", reviewedDate: null });
  });

  it("gives dates the stored practice scene and their callback without fetching coach history", async () => {
    findFirst.mockResolvedValueOnce({ ...session, personaId: "maya", scenario: {
      setting: "Bookshop", openingLine: "What are you reading?", difficulty: "easy", targetWeakness: "listening",
    } });
    const call = await resolveCallSession("call-id", userId);
    if ("error" in call) throw Error(call.error);
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(call.dynamicVariables.opening_line).toEqual("What are you reading?");
    expect(JSON.parse(call.dynamicVariables.session_context)).toEqual({ setting: "Bookshop", difficulty: "easy", practiceFocus: "listening", rememberedDetail: "Private callback" });
  });

  it("rejects non-owned, ended and demo sessions before retrieving memory", async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...session, status: "ended" }).mockResolvedValueOnce({ ...session, source: "demo" });
    await expect(resolveCallSession("elsewhere", userId)).resolves.toMatchObject({ status: 404 });
    await expect(resolveCallSession("closed", userId)).resolves.toMatchObject({ status: 409 });
    await expect(resolveCallSession("demo", userId)).resolves.toMatchObject({ status: 409 });
    expect(findFirst).toHaveBeenCalledTimes(3);
  });
});

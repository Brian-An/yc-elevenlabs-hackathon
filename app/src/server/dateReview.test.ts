import { afterEach, describe, expect, it, vi } from "vitest";
import type { Persona, Scenario, Transcript } from "../shared/types";
import { DateReviewError, dateReviewEnabled, generateDateReview, reviewScores } from "./dateReview";

const persona: Persona = { id: "maya", name: "Maya", age: 27, bio: "", personality: "" };
const scenario: Scenario = { id: "coffee", personaId: "maya", setting: "A café", difficulty: "easy" };
const transcript: Transcript = [
  { speaker: "agent", text: "My pot cracked in the kiln.", timestamp: 0 },
  { speaker: "user", text: "What a letdown. Was it a gift?", timestamp: 1000 },
  { speaker: "agent", text: "It was for my sister.", timestamp: 2000 },
  { speaker: "user", text: "What would she have liked about it?", timestamp: 3000 },
];

function draft() {
  return {
    summary: "You followed Maya's pottery story from the accident to the person the gift was for.",
    overall: 68,
    moments: [{ point: "You invited Maya to describe her sister.", agentTurnIndex: 2, userTurnIndex: 3 }],
    strengths: [{ skill: "listening", point: "You followed the detail about the gift.", turnIndex: 3 }],
    weaknesses: [],
    skills: {
      listening: { score: 8, turnIndices: [1, 3] },
      engagement: { score: 7, turnIndices: [3] },
      confidence: { score: null, turnIndices: [] },
      flow: { score: null, turnIndices: [] },
    },
    practice: { skill: "engagement", instruction: "Try adding a relevant experience of your own.", exampleReply: "I once broke a mug I was saving as a gift.", agentTurnIndex: 2, userTurnIndex: 3 },
  };
}

function provider(body: unknown, stopReason = "end_turn") {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json({
    model: "test-model-version",
    stop_reason: stopReason,
    content: [{ type: "text", text: JSON.stringify(body) }],
    usage: { input_tokens: 1200, output_tokens: 340 },
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("whole-date review", () => {
  it("calls Anthropic with the full numbered conversation and schema, grounds quotes, and scores only evidenced skills", async () => {
    const result = draft();
    const request = provider({ ...result, strengths: [{ ...result.strengths[0], quote: "Invented words" }] });
    const { review } = await generateDateReview(transcript, scenario, persona);

    expect(request).toHaveBeenCalledWith("https://api.anthropic.com/v1/messages", expect.objectContaining({
      headers: expect.objectContaining({ "x-api-key": "test-key" }),
      body: expect.stringContaining('"type":"json_schema"'),
    }));
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(JSON.parse(body.messages[0].content).turns).toEqual(transcript.map(({ speaker, text }, index) => ({ speaker, text, index })));
    expect(body.output_config.format.schema.additionalProperties).toBe(false);
    expect(JSON.stringify(body.output_config.format.schema)).not.toMatch(/"(minimum|maximum|minLength|maxLength|maxItems)":/);
    const { overall: _overall, ...shown } = result;
    expect(review).toMatchObject({ ...shown, overallScore: 75, model: "test-model-version", rubricVersion: "whole-date-v2" });
    expect(review).not.toHaveProperty("overall");
    expect(review.strengths[0].quote).toBe(transcript[3].text);
    expect(review.transcriptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("falls back to the reviewer's overall score when a single reply can't establish the skill average", async () => {
    const result = draft();
    result.skills.listening.turnIndices = [1];
    result.skills.engagement.turnIndices = [1];
    result.strengths[0].turnIndex = 1;
    result.moments = [];
    provider({ ...result, practice: null });
    const { review } = await generateDateReview(transcript.slice(0, 2), scenario, persona);
    expect(review.overallScore).toBe(68);
    expect(review.strengths[0].quote).toBe(transcript[1].text);
  });

  it("returns an unscored review without contacting the provider when a speaker's text is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    const { review } = await generateDateReview([transcript[0], { ...transcript[1], text: " " }], scenario, persona);
    expect(review).toMatchObject({ overallScore: null, practice: null, strengths: [], model: null });
    expect(Object.values(review.skills).every(({ score }) => score === null)).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    ["point attributed to the persona", () => ({ ...draft(), strengths: [{ ...draft().strengths[0], turnIndex: 2 }] })],
    ["missing evidence", () => ({ ...draft(), skills: { ...draft().skills, listening: { score: 4, turnIndices: [] } } })],
    ["duplicate evidence", () => ({ ...draft(), skills: { ...draft().skills, listening: { score: 4, turnIndices: [1, 1] } } })],
    ["evidence for an unscored skill", () => ({ ...draft(), skills: { ...draft().skills, listening: { score: null, turnIndices: [1] } } })],
    ["out-of-range score", () => ({ ...draft(), skills: { ...draft().skills, listening: { score: 11, turnIndices: [1] } } })],
    ["invented turn", () => ({ ...draft(), moments: [{ ...draft().moments[0], userTurnIndex: 15 }] })],
    ["reversed exchange", () => ({ ...draft(), moments: [{ ...draft().moments[0], userTurnIndex: 1 }] })],
    ["reversed practice", () => ({ ...draft(), practice: { ...draft().practice, userTurnIndex: 1 } })],
  ] as const)("rejects %s", async (_name, makeDraft) => {
    provider(makeDraft());
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toThrow(/review/i);
  });

  it.each(["refusal", "max_tokens"])("rejects %s even when the response resembles a complete review", async (stopReason) => {
    provider(draft(), stopReason);
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toThrow("did not complete");
  });

  it("reports provider unavailability without fabricating a review or exposing the response body", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "  ");
    expect(dateReviewEnabled()).toBe(false);
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toThrow("not configured");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private provider diagnostic", { status: 429 })));
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toThrow("Anthropic date review failed (HTTP 429).");
  });

  it("reports token usage and the compact scores that history lists read", async () => {
    provider(draft());
    const { review, usage } = await generateDateReview(transcript, scenario, persona);
    expect(usage).toEqual({ inputTokens: 1200, outputTokens: 340 });
    expect(reviewScores(review)).toEqual({ scores: { listening: 8, engagement: 7 }, overallScore: 75, rubricVersion: "whole-date-v2" });
  });

  it.each([
    [new Response("", { status: 429, headers: { "retry-after": "40" } }), "rate_limited", 40_000],
    [new Response("", { status: 529 }), "overloaded", null],
    [new Response("", { status: 500 }), "provider_error", null],
    [new Response("", { status: 401 }), "rejected", null],
  ] as const)("classifies HTTP failures for the retry policy (%#)", async (response, failureClass, retryAfterMs) => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => response));
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toMatchObject({ failureClass, retryAfterMs });
  });

  it("classifies timeouts, network errors, and invalid output", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toMatchObject({ failureClass: "timeout" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(generateDateReview(transcript, scenario, persona)).rejects.toMatchObject({ failureClass: "network" });
    provider({ ...draft(), moments: [{ ...draft().moments[0], userTurnIndex: 15 }] });
    const error = await generateDateReview(transcript, scenario, persona).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DateReviewError);
    expect(error).toMatchObject({ failureClass: "invalid_output" });
  });
});

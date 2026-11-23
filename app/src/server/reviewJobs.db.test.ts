// Runs the review job against a real PostgreSQL database with a stubbed Anthropic API.
// Set TEST_DATABASE_URL to a migrated, disposable database (see README). The suite deletes the rows it creates.
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transcript } from "../shared/types";

const databaseUrl = process.env.TEST_DATABASE_URL;
const { db, submit, delay } = vi.hoisted(() => {
  const submit = vi.fn(async () => undefined);
  return { db: { client: null as PrismaClient | null }, submit, delay: vi.fn(() => ({ submit })) };
});

vi.mock("wasp/server", () => ({
  get prisma() { return db.client!; },
  HttpError: class HttpError extends Error {
    constructor(readonly statusCode: number, message?: string) { super(message); }
  },
}));
vi.mock("wasp/server/jobs", () => ({ runDateReview: { submit, delay } }));
vi.mock("./memory", async (importOriginal) => {
  const original = await importOriginal<typeof import("./memory")>();
  return { ...original, saveReviewMemory: vi.fn(original.saveReviewMemory) };
});

const { saveReviewMemory } = await import("./memory");
const { claimReviewJob, completeClaimedReview, processReviewJob, adoptOrphanedReviews, dueReviewJobIds, LEASE_MS, UNCONFIGURED_RECHECK_MS } =
  await import("./reviewJobs");
const { createDateSession, endDateSession, retryDateReview, listDateSessions } = await import("./sessions");
const { getMemory } = await import("./memory");
const realSaveReviewMemory = vi.mocked(saveReviewMemory).getMockImplementation()!;

const transcript: Transcript = [
  { speaker: "agent", text: "My pot cracked in the kiln.", timestamp: 0 },
  { speaker: "user", text: "What a letdown. Was it a gift?", timestamp: 1000 },
  { speaker: "agent", text: "It was for my sister.", timestamp: 2000 },
  { speaker: "user", text: "What would she have liked about it?", timestamp: 3000 },
];

const draft = {
  summary: "You followed Maya's pottery story from the accident to the person the gift was for.",
  moments: [{ point: "You invited Maya to describe her sister.", agentTurnIndex: 2, userTurnIndex: 3 }],
  strengths: [{ skill: "listening", point: "You followed the detail about the gift.", turnIndex: 3 }],
  weaknesses: [],
  skills: {
    listening: { score: 8, turnIndices: [1, 3] },
    engagement: { score: 7, turnIndices: [3] },
    confidence: { score: null, turnIndices: [] },
    flow: { score: null, turnIndices: [] },
  },
  practice: null,
};

const reviewResponse = () => Response.json({
  model: "test-model", stop_reason: "end_turn",
  content: [{ type: "text", text: JSON.stringify(draft) }],
  usage: { input_tokens: 1000, output_tokens: 200 },
});

let provider: ReturnType<typeof vi.fn<typeof fetch>>;
let now: number;
const users: string[] = [];
const at = (ms: number) => { now += ms; vi.setSystemTime(now); };

function context() {
  const client = db.client!;
  return { entities: {
    User: client.user, DateSession: client.dateSession, Move: client.move, ReviewJob: client.reviewJob,
    UserMemory: client.userMemory, PersonaCallback: client.personaCallback,
  } } as never;
}

/** Ends a live Maya date through the normal operations and returns its review job. */
async function endDate() {
  const userId = randomUUID();
  users.push(userId);
  const session = await createDateSession({ userId, personaId: "maya" }, context());
  const ended = await endDateSession({ userId, id: session.id, transcript }, context());
  const job = await db.client!.reviewJob.findFirstOrThrow({ where: { sessionId: session.id } });
  return { userId, sessionId: session.id, ended, jobId: job.id };
}

async function state(sessionId: string, userId: string) {
  const client = db.client!;
  const session = await client.dateSession.findUniqueOrThrow({ where: { id: sessionId } });
  const jobs = await client.reviewJob.findMany({ where: { sessionId } });
  const memory = await getMemory(userId);
  return { session, job: jobs[0], jobCount: jobs.length, memory };
}

async function expectOneCompletedReview(sessionId: string, userId: string) {
  const { session, job, jobCount, memory } = await state(sessionId, userId);
  expect(session).toMatchObject({ status: "evaluated", reviewStatus: "ready" });
  expect(session.reviewScores).toEqual({ scores: { listening: 8, engagement: 7 }, overallScore: 75, rubricVersion: "whole-date-v1" });
  expect(jobCount).toBe(1);
  expect(job).toMatchObject({ status: "succeeded", leaseToken: null, failureClass: null });
  expect(memory.skillHistory.filter((entry) => entry.sessionId === sessionId)).toHaveLength(1);
  expect(memory.strengths.filter((point) => point.sessionId === sessionId)).toHaveLength(1);
  return job;
}

describe("retry backoff", () => {
  it("grows fourfold from 30 seconds to an hourly cap, within 20% jitter", async () => {
    const { backoffMs } = await import("./reviewJobs");
    expect([1, 2, 3, 4, 5, 6].map((attempt) => backoffMs(attempt, () => 0.5))).toEqual([30_000, 120_000, 480_000, 1_920_000, 3_600_000, 3_600_000]);
    expect(backoffMs(1, () => 0)).toBe(24_000);
    expect(backoffMs(1, () => 1)).toBe(36_000);
  });
});

describe.skipIf(!databaseUrl)("durable date review job (PostgreSQL)", () => {
  beforeAll(async () => {
    db.client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.client.$connect();
  });

  afterAll(async () => {
    await db.client?.user.deleteMany({ where: { id: { in: users } } });
    await db.client?.$disconnect();
  });

  beforeEach(() => {
    now = Date.parse("2026-11-23T12:00:00Z");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_test");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    provider = vi.fn<typeof fetch>(async () => reviewResponse());
    vi.stubGlobal("fetch", provider);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    submit.mockClear();
    delay.mockClear();
    vi.mocked(saveReviewMemory).mockImplementation(realSaveReviewMemory);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns as soon as the transcript is saved, with a queued job and a wake-up", async () => {
    const { ended, jobId, sessionId, userId } = await endDate();
    expect(ended).toMatchObject({ status: "ended", reviewStatus: "pending", review: null });
    expect(ended.reviewJob).toMatchObject({ status: "queued", attempts: 0, maxAttempts: 5, failureClass: null });
    expect(provider).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledWith({ jobId });

    await expect(processReviewJob(jobId)).resolves.toBe("succeeded");
    const job = await expectOneCompletedReview(sessionId, userId);
    expect(job).toMatchObject({ attempts: 1, inputTokens: 1000, outputTokens: 200 });
    expect(job.latencyMs).toBeGreaterThanOrEqual(0);
    const logged = JSON.parse(String(vi.mocked(console.info).mock.calls.at(-1)?.[0]));
    expect(logged).toMatchObject({ event: "date_review_attempt", outcome: "succeeded", attempt: 1, inputTokens: 1000, outputTokens: 200 });
    expect(logged.providerLatencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(logged)).not.toContain("pot cracked");

    // History reads the denormalized columns, not the transcript or review.
    const [summary] = await listDateSessions({ userId }, context());
    expect(summary).toMatchObject({ turnCount: 4, replyCount: 2, reviewScores: { overallScore: 75 } });
    expect(summary).not.toHaveProperty("transcript");
    expect(summary).not.toHaveProperty("review");
  });

  it("recovers a worker killed before inference once its lease expires", async () => {
    const { jobId, sessionId, userId } = await endDate();
    expect(await claimReviewJob(jobId)).not.toBeNull(); // The worker dies holding the lease.
    expect((await state(sessionId, userId)).session.reviewStatus).toBe("processing");

    expect(await processReviewJob(jobId)).toBe("skipped");
    expect(await dueReviewJobIds()).not.toContain(jobId);
    at(LEASE_MS + 1);
    expect(await dueReviewJobIds()).toContain(jobId);
    expect(await processReviewJob(jobId)).toBe("succeeded");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await expectOneCompletedReview(sessionId, userId)).toMatchObject({ attempts: 2 });
  });

  it("reuses the stored review when a worker is killed after inference", async () => {
    const { jobId, sessionId, userId } = await endDate();
    const claim = await claimReviewJob(jobId);
    vi.mocked(saveReviewMemory).mockRejectedValueOnce(new Error("killed"));
    await expect(completeClaimedReview(claim!, { latencyMs: null, usage: null })).rejects.toThrow("killed");
    const killed = await state(sessionId, userId);
    expect(killed.session).toMatchObject({ status: "ended", reviewStatus: "processing" });
    expect(killed.session.review).not.toBeNull();
    expect(killed.memory.skillHistory).toHaveLength(0);

    at(LEASE_MS + 1);
    expect(await processReviewJob(jobId)).toBe("succeeded");
    expect(provider).toHaveBeenCalledTimes(1);
    await expectOneCompletedReview(sessionId, userId);
  });

  it("rolls back a partial memory projection and writes it once on recovery", async () => {
    const { jobId, sessionId, userId } = await endDate();
    const claim = await claimReviewJob(jobId);
    vi.mocked(saveReviewMemory).mockImplementationOnce(async (...args) => {
      await realSaveReviewMemory(...args);
      throw new Error("killed during projection");
    });
    await expect(completeClaimedReview(claim!, { latencyMs: null, usage: null })).rejects.toThrow("projection");
    const killed = await state(sessionId, userId);
    expect(killed.session.status).toBe("ended");
    expect(killed.memory.skillHistory).toHaveLength(0);

    at(LEASE_MS + 1);
    expect(await processReviewJob(jobId)).toBe("succeeded");
    expect(provider).toHaveBeenCalledTimes(1);
    await expectOneCompletedReview(sessionId, userId);
  });

  it("runs inference once for simultaneous workers, wake-ups, and retries", async () => {
    const { jobId, sessionId, userId } = await endDate();
    const outcomes = await Promise.all([
      processReviewJob(jobId), processReviewJob(jobId), processReviewJob(jobId),
      retryDateReview({ userId, id: sessionId }, context()),
      endDateSession({ userId, id: sessionId }, context()),
    ]);
    expect(outcomes.filter((outcome) => outcome === "succeeded")).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(1);
    await expectOneCompletedReview(sessionId, userId);
  });

  it("waits without spending attempts while the provider key is missing, then recovers", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { jobId, sessionId, userId } = await endDate();
    expect(await processReviewJob(jobId)).toBe("skipped");
    let { session, job } = await state(sessionId, userId);
    expect(session.reviewStatus).toBe("pending");
    expect(job).toMatchObject({ status: "queued", attempts: 0, failureClass: "not_configured" });
    expect(job.runAfter.getTime()).toBe(now + UNCONFIGURED_RECHECK_MS);
    expect(provider).not.toHaveBeenCalled();

    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    at(UNCONFIGURED_RECHECK_MS);
    expect(await processReviewJob(jobId)).toBe("succeeded");
    ({ job } = await state(sessionId, userId));
    expect(job.attempts).toBe(1);
    await expectOneCompletedReview(sessionId, userId);
  });

  it("honors the provider's retry-after on rate limits and keeps counting tokens across attempts", async () => {
    const { jobId, sessionId, userId } = await endDate();
    provider.mockResolvedValueOnce(new Response("private diagnostic", { status: 429, headers: { "retry-after": "90" } }));
    expect(await processReviewJob(jobId)).toBe("retrying");
    const { session, job } = await state(sessionId, userId);
    expect(session.reviewStatus).toBe("pending");
    expect(job).toMatchObject({ status: "queued", attempts: 1, failureClass: "rate_limited", leaseToken: null });
    expect(job.runAfter.getTime()).toBe(now + 90_000);
    expect(delay).toHaveBeenCalledWith(new Date(now + 90_000));

    at(60_000);
    expect(await processReviewJob(jobId)).toBe("skipped");
    at(30_000);
    expect(await processReviewJob(jobId)).toBe("succeeded");
    expect(await expectOneCompletedReview(sessionId, userId)).toMatchObject({ attempts: 2, inputTokens: 1000 });
  });

  it("stops after the attempt budget, then a user retry grants a new budget", async () => {
    const { jobId, sessionId, userId } = await endDate();
    provider.mockImplementation(async () => new Response("", { status: 529 }));
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(await processReviewJob(jobId)).toBe(attempt < 5 ? "retrying" : "failed");
      at(2 * 60 * 60_000);
    }
    let { session, job } = await state(sessionId, userId);
    expect(session.reviewStatus).toBe("failed");
    expect(job).toMatchObject({ status: "failed", attempts: 5, failureClass: "overloaded" });
    expect(await processReviewJob(jobId)).toBe("skipped");

    provider.mockImplementation(async () => reviewResponse());
    const retried = await retryDateReview({ userId, id: sessionId }, context());
    expect(retried).toMatchObject({ reviewStatus: "pending", reviewJob: { status: "queued", attempts: 5, maxAttempts: 10, failureClass: null } });
    expect(await processReviewJob(jobId)).toBe("succeeded");
    ({ job } = await state(sessionId, userId));
    expect(job.attempts).toBe(6);
    await expectOneCompletedReview(sessionId, userId);
  });

  it("stops at once when the provider rejects the request", async () => {
    const { jobId, sessionId, userId } = await endDate();
    provider.mockResolvedValueOnce(new Response("", { status: 401 }));
    expect(await processReviewJob(jobId)).toBe("failed");
    const { session, job } = await state(sessionId, userId);
    expect(session.reviewStatus).toBe("failed");
    expect(job).toMatchObject({ status: "failed", attempts: 1, failureClass: "rejected" });
    expect(delay).not.toHaveBeenCalled();
  });

  it("fails a job whose worker died during its final attempt", async () => {
    const { jobId, sessionId, userId } = await endDate();
    await db.client!.reviewJob.update({ where: { id: jobId }, data: { attempts: 4 } });
    expect(await claimReviewJob(jobId)).not.toBeNull();
    at(LEASE_MS + 1);
    expect(await processReviewJob(jobId)).toBe("skipped");
    const { session, job } = await state(sessionId, userId);
    expect(session.reviewStatus).toBe("failed");
    expect(job).toMatchObject({ status: "failed", attempts: 5, failureClass: "interrupted" });
  });

  it("creates one job when retries race on a date that ended before review jobs existed", async () => {
    const { jobId, sessionId, userId } = await endDate();
    await db.client!.reviewJob.delete({ where: { id: jobId } });
    await db.client!.dateSession.update({ where: { id: sessionId }, data: { reviewStatus: "failed" } });
    const results = await Promise.all([1, 2, 3].map(() => retryDateReview({ userId, id: sessionId }, context())));
    expect(results.every((result) => result.reviewStatus === "pending")).toBe(true);
    expect(await db.client!.reviewJob.count({ where: { sessionId } })).toBe(1);
  });

  it("adopts dates that ended before review jobs existed", async () => {
    const { jobId, sessionId, userId } = await endDate();
    await db.client!.reviewJob.delete({ where: { id: jobId } });
    await db.client!.dateSession.update({ where: { id: sessionId }, data: { reviewStatus: "processing" } });
    const adopted = await adoptOrphanedReviews();
    const job = await db.client!.reviewJob.findFirstOrThrow({ where: { sessionId } });
    expect(adopted).toContain(job.id);
    expect(await adoptOrphanedReviews()).not.toContain(job.id);
    expect(await processReviewJob(job.id)).toBe("succeeded");
    await expectOneCompletedReview(sessionId, userId);
  });

  it("skips demo dates and coaching sessions", async () => {
    const userId = randomUUID();
    users.push(userId);
    // Prisma loads the app's env files, which can configure per-persona agents.
    vi.stubEnv("ELEVENLABS_AGENT_ID", "");
    vi.stubEnv("ELEVENLABS_AGENT_ID_MAYA", "");
    const demo = await createDateSession({ userId, personaId: "maya" }, context());
    const ended = await endDateSession({ userId, id: demo.id, transcript }, context());
    expect(ended).toMatchObject({ source: "demo", status: "evaluated", reviewStatus: "skipped", reviewJob: null });
    expect(await db.client!.reviewJob.count({ where: { sessionId: demo.id } })).toBe(0);

    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_test");
    const coach = await createDateSession({ userId, personaId: "coach" }, context());
    const coached = await endDateSession({ userId, id: coach.id, transcript }, context());
    expect(coached).toMatchObject({ kind: "coaching", status: "evaluated", reviewStatus: "skipped", reviewJob: null });
    expect(provider).not.toHaveBeenCalled();
  });
});

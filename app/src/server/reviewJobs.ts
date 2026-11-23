// Durable whole-date reviews. A ReviewJob row is the queue entry and is created in the transaction that
// freezes the transcript. PgBoss jobs only wake workers: duplicate or lost wake-ups are harmless because
// every state change is conditional on the worker's lease, and the sweep re-submits anything that is due.
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Prisma } from "@prisma/client";
import type { DateSession, ReviewJob } from "wasp/entities";
import { prisma } from "wasp/server";
import { runDateReview as reviewQueue, type RunDateReview, type SweepDateReviews } from "wasp/server/jobs";
import type { DateReview } from "../shared/dateReview";
import type { Scenario, Transcript } from "../shared/types";
import type { ReviewJobDTO } from "./dto";
import {
  DateReviewError,
  dateReviewEnabled,
  generateDateReview,
  RUBRIC_VERSION,
  reviewNeedsInference,
  reviewScores,
  transcriptHash,
  type ReviewFailureClass,
  type ReviewUsage,
} from "./dateReview";
import { saveReviewMemory } from "./memory";
import { getPersona } from "./personas";
import { asJson, readJson } from "./serialize";

export const MAX_ATTEMPTS = 5;
// Covers the provider timeout (45s) and memory projection with room to spare.
export const LEASE_MS = 120_000;
// While no provider key is configured, waiting jobs are rechecked at this interval without using an attempt.
export const UNCONFIGURED_RECHECK_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
const SWEEP_BATCH = 50;

type JobFailureClass = ReviewFailureClass | "interrupted";
type Tx = Prisma.TransactionClient;
type Claim = { job: ReviewJob; session: DateSession; token: string };
/** Provider metrics for one attempt. `stored` is set once they are on the job row, so a failure never adds them twice. */
type AttemptMetrics = { latencyMs: number | null; usage: ReviewUsage | null; stored?: boolean };

/** 30s, 2m, 8m, 32m, then hourly, each with ±20% jitter so a provider outage does not retry in lockstep. */
export function backoffMs(attempt: number, random = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 4 ** Math.max(0, attempt - 1));
  return Math.round(base * (0.8 + 0.4 * random()));
}

/**
 * Creates the job for a frozen transcript inside the caller's transaction. The identity covers the session,
 * the exact dialogue, and the rubric, so repeating the call returns the existing job.
 */
export async function enqueueReview(tx: Tx, session: Pick<DateSession, "id" | "transcript">): Promise<ReviewJob> {
  const identity = {
    sessionId: session.id,
    transcriptHash: transcriptHash(readJson<Transcript>(session.transcript, [])),
    rubricVersion: RUBRIC_VERSION,
  };
  // ON CONFLICT DO NOTHING, so concurrent first enqueues never abort the caller's transaction.
  // Due checks compare against the app clock, so the first run time comes from it too.
  await tx.reviewJob.createMany({ data: [{ ...identity, maxAttempts: MAX_ATTEMPTS, runAfter: new Date() }], skipDuplicates: true });
  return tx.reviewJob.findUniqueOrThrow({ where: { sessionId_transcriptHash_rubricVersion: identity } });
}

/** Asks a worker to run the job. Best effort: if the wake-up is lost, the sweep finds the job when it is due. */
export async function wakeReview(jobId: string, delayMs = 0): Promise<void> {
  try {
    const queue = delayMs > 0 ? reviewQueue.delay(new Date(Date.now() + delayMs)) : reviewQueue;
    await queue.submit({ jobId });
  } catch (error) {
    console.error("Date review wake-up failed", jobId, error instanceof Error ? error.name : "unknown");
  }
}

export function latestReviewJob(sessionId: string): Promise<ReviewJob | null> {
  return prisma.reviewJob.findFirst({ where: { sessionId }, orderBy: { createdAt: "desc" } });
}

export function toReviewJobDTO(job: ReviewJob | null): ReviewJobDTO | null {
  if (!job) return null;
  return {
    status: job.status as ReviewJobDTO["status"],
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    nextAttemptAt: job.status === "queued" ? job.runAfter : null,
    failureClass: job.failureClass as ReviewJobDTO["failureClass"],
  };
}

const isDue = (job: ReviewJob, now: Date) =>
  (job.status === "queued" && job.runAfter <= now)
  || (job.status === "running" && job.leaseExpiresAt !== null && job.leaseExpiresAt < now);

const hasStoredReview = (session: DateSession, job: ReviewJob) => {
  const review = readJson<DateReview | null>(session.review, null);
  return review?.transcriptHash === job.transcriptHash && review.rubricVersion === job.rubricVersion;
};

/**
 * Takes a lease on a due job and counts the attempt. Every write is conditional on the row being unchanged
 * since it was read, so simultaneous workers and retries claim a job at most once.
 */
export async function claimReviewJob(jobId: string, now = new Date()): Promise<Claim | null> {
  const job = await prisma.reviewJob.findUnique({ where: { id: jobId }, include: { session: true } });
  if (!job || !isDue(job, now)) return null;
  const { session, ...row } = job;
  const unchanged = { id: job.id, status: job.status, attempts: job.attempts, leaseToken: job.leaseToken };
  const expiredLease = job.status === "running";

  if (session.status !== "ended") {
    // The session was finalized by another job identity, such as a review under an earlier rubric.
    await prisma.reviewJob.updateMany({ where: unchanged, data: { status: "succeeded", leaseToken: null, leaseExpiresAt: null, finishedAt: now } });
    return null;
  }
  const transcript = readJson<Transcript>(session.transcript, []);
  if (!hasStoredReview(session, row) && reviewNeedsInference(transcript) && !dateReviewEnabled()) {
    await prisma.reviewJob.updateMany({
      where: unchanged,
      data: {
        status: "queued", leaseToken: null, leaseExpiresAt: null, failureClass: "not_configured",
        runAfter: new Date(now.getTime() + UNCONFIGURED_RECHECK_MS),
      },
    });
    return null;
  }
  if (expiredLease && job.attempts >= job.maxAttempts) {
    // The worker died during its final attempt.
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.reviewJob.updateMany({
        where: unchanged,
        data: { status: "failed", failureClass: "interrupted", leaseToken: null, leaseExpiresAt: null, finishedAt: now },
      });
      if (count) await tx.dateSession.updateMany({ where: { id: session.id, status: "ended" }, data: { reviewStatus: "failed" } });
    });
    return null;
  }

  const token = randomUUID();
  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.reviewJob.updateMany({
      where: unchanged,
      data: {
        status: "running", leaseToken: token, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), attempts: job.attempts + 1,
        ...(expiredLease ? { failureClass: "interrupted" } : {}),
      },
    });
    if (count) await tx.dateSession.updateMany({ where: { id: session.id, status: "ended" }, data: { reviewStatus: "processing" } });
    return count > 0;
  });
  if (!claimed) return null;
  return { job: { ...row, attempts: job.attempts + 1, leaseToken: token }, session, token };
}

/**
 * Runs inference unless an earlier attempt already stored the review, then projects it into memory.
 * A crash at any point leaves the lease to expire. The next worker reuses a stored review, and the
 * memory projection replaces this session's contribution, so a completed job yields one memory entry.
 */
export async function completeClaimedReview({ job, session, token }: Claim, metrics: AttemptMetrics): Promise<void> {
  const held = { id: job.id, leaseToken: token };
  let review = hasStoredReview(session, job) ? readJson<DateReview | null>(session.review, null) : null;
  if (!review) {
    const persona = getPersona(session.personaId);
    if (!persona) throw new DateReviewError("Date review persona is unknown.", "internal");
    const transcript = readJson<Transcript>(session.transcript, []);
    const started = performance.now();
    let result: Awaited<ReturnType<typeof generateDateReview>>;
    try {
      result = await generateDateReview(transcript, readJson<Scenario>(session.scenario, persona.defaultScenario), persona);
    } finally {
      metrics.latencyMs = Math.round(performance.now() - started);
    }
    metrics.usage = result.usage;
    review = result.review;
    if (review.transcriptHash !== job.transcriptHash) throw new DateReviewError("Date review transcript changed.", "internal");
    const reviewed = review;
    // A validated review is durable before projection, so a later attempt never pays for inference twice.
    const saved = await prisma.$transaction(async (tx) => {
      const { count } = await tx.reviewJob.updateMany({ where: held, data: attemptData(metrics) });
      if (count) await tx.dateSession.update({ where: { id: session.id }, data: { review: asJson(reviewed), reviewScores: asJson(reviewScores(reviewed)) } });
      return count > 0;
    });
    metrics.stored = saved;
    if (!saved) return;
  }

  const result = review;
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.reviewJob.updateMany({
      where: held,
      data: { status: "succeeded", leaseToken: null, leaseExpiresAt: null, failureClass: null, finishedAt: new Date() },
    });
    if (!count) return;
    await tx.dateSession.update({ where: { id: session.id }, data: { status: "evaluated", reviewStatus: "ready" } });
    await saveReviewMemory(tx, session.userId, result, { sessionId: session.id, personaId: session.personaId, endedAt: session.endedAt! });
  });
}

function attemptData(metrics: AttemptMetrics) {
  if (metrics.stored) return {};
  return {
    ...(metrics.latencyMs === null ? {} : { latencyMs: metrics.latencyMs }),
    ...(metrics.usage ? {
      inputTokens: { increment: metrics.usage.inputTokens },
      outputTokens: { increment: metrics.usage.outputTokens },
    } : {}),
  };
}

/** Releases the lease and schedules the next attempt, or ends the job once its attempt budget is spent. */
async function recordFailure({ job, session, token }: Claim, error: unknown, metrics: AttemptMetrics, now = new Date()) {
  const failureClass: ReviewFailureClass = error instanceof DateReviewError ? error.failureClass : "internal";
  // A key removed mid-attempt is a configuration problem, not a failed attempt.
  const unconfigured = failureClass === "not_configured";
  const attempts = unconfigured ? job.attempts - 1 : job.attempts;
  const terminal = !unconfigured && (failureClass === "rejected" || attempts >= job.maxAttempts);
  const retryAfter = error instanceof DateReviewError ? error.retryAfterMs ?? 0 : 0;
  const delayMs = unconfigured ? UNCONFIGURED_RECHECK_MS : Math.max(backoffMs(attempts), retryAfter);
  const released = await prisma.$transaction(async (tx) => {
    const { count } = await tx.reviewJob.updateMany({
      where: { id: job.id, leaseToken: token },
      data: {
        ...attemptData(metrics), attempts, failureClass, leaseToken: null, leaseExpiresAt: null,
        ...(terminal ? { status: "failed", finishedAt: now } : { status: "queued", runAfter: new Date(now.getTime() + delayMs) }),
      },
    });
    if (count) {
      await tx.dateSession.updateMany({ where: { id: session.id, status: "ended" }, data: { reviewStatus: terminal ? "failed" : "pending" } });
    }
    return count > 0;
  });
  return { failureClass, terminal, released, delayMs };
}

export type ReviewAttemptOutcome = "succeeded" | "retrying" | "failed" | "skipped";

/** Claims and runs one attempt of a job. Never throws, so PgBoss never retries on its own. */
export async function processReviewJob(jobId: string): Promise<ReviewAttemptOutcome> {
  const claim = await claimReviewJob(jobId).catch((error: unknown) => {
    console.error("Date review claim failed", jobId, error instanceof Error ? error.name : "unknown");
    return null;
  });
  if (!claim) return "skipped";
  const metrics: AttemptMetrics = { latencyMs: null, usage: null };
  const started = performance.now();
  let outcome: ReviewAttemptOutcome = "succeeded";
  let failureClass: JobFailureClass | null = null;
  try {
    await completeClaimedReview(claim, metrics);
  } catch (error) {
    try {
      const failure = await recordFailure(claim, error, metrics);
      failureClass = failure.failureClass;
      outcome = failure.terminal ? "failed" : "retrying";
      if (failure.released && !failure.terminal) await wakeReview(jobId, failure.delayMs);
    } catch (recordError) {
      // The lease expires and the sweep retries the job.
      console.error("Date review failure was not recorded", jobId, recordError instanceof Error ? recordError.name : "unknown");
      outcome = "retrying";
    }
  }
  // One structured line per attempt for aggregation. It never includes dialogue or provider bodies.
  console.info(JSON.stringify({
    event: "date_review_attempt", jobId, sessionId: claim.session.id, attempt: claim.job.attempts, outcome, failureClass,
    providerLatencyMs: metrics.latencyMs, totalMs: Math.round(performance.now() - started),
    inputTokens: metrics.usage?.inputTokens ?? null, outputTokens: metrics.usage?.outputTokens ?? null,
  }));
  return outcome;
}

/** Ended live dates that are waiting for a review but have no job, such as dates ended before jobs existed. */
export async function adoptOrphanedReviews(limit = SWEEP_BATCH): Promise<string[]> {
  const orphans = await prisma.dateSession.findMany({
    where: { status: "ended", kind: "date", source: "live", reviewStatus: { in: ["pending", "processing"] }, reviewJobs: { none: {} } },
    select: { id: true, transcript: true },
    take: limit,
  });
  const jobs = await Promise.all(orphans.map((session) => prisma.$transaction((tx) => enqueueReview(tx, session))));
  return jobs.map((job) => job.id);
}

export async function dueReviewJobIds(now = new Date(), limit = SWEEP_BATCH): Promise<string[]> {
  const jobs = await prisma.reviewJob.findMany({
    where: { OR: [
      { status: "queued", runAfter: { lte: now } },
      { status: "running", leaseExpiresAt: { lt: now } },
    ] },
    orderBy: { runAfter: "asc" },
    select: { id: true },
    take: limit,
  });
  return jobs.map((job) => job.id);
}

export const runDateReview: RunDateReview<{ jobId: string }, void> = async (args) => {
  if (typeof args?.jobId === "string") await processReviewJob(args.jobId);
};

export const sweepDateReviews: SweepDateReviews<never, void> = async () => {
  await adoptOrphanedReviews();
  for (const jobId of await dueReviewJobIds()) await wakeReview(jobId);
};

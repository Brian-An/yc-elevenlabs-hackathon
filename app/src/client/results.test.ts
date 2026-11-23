import { describe, expect, it } from "vitest";
import type { DateSessionDTO } from "../server/dto";
import { reviewNotice, reviewPollMs } from "./results";

const base: Pick<DateSessionDTO, "kind" | "source" | "status" | "reviewStatus" | "transcript" | "reviewJob"> = {
  kind: "date", source: "live", status: "ended", reviewStatus: "pending",
  transcript: [{ speaker: "agent", text: "Hi", timestamp: 0 }, { speaker: "user", text: "Hello", timestamp: 1 }],
  reviewJob: { status: "queued", attempts: 0, maxAttempts: 5, nextAttemptAt: null, failureClass: null },
};

describe("background review status", () => {
  it("names each state and checks often only while a review can finish soon", () => {
    expect(reviewNotice(base).title).toBe("Reviewing your date");
    expect(reviewPollMs(base)).toBe(3000);

    const delayed = { ...base, reviewJob: { ...base.reviewJob!, attempts: 1, failureClass: "overloaded" as const, nextAttemptAt: new Date() } };
    expect(reviewNotice(delayed).title).toBe("Date review delayed");
    expect(reviewPollMs(delayed)).toBe(30_000);
    expect(reviewPollMs({ ...delayed, reviewStatus: "processing", reviewJob: { ...delayed.reviewJob, status: "running" } })).toBe(3000);

    const offline = { ...base, reviewJob: { ...base.reviewJob!, failureClass: "not_configured" as const } };
    expect(reviewNotice(offline).title).toBe("Date review waiting");

    const failed = { ...base, reviewStatus: "failed" as const, reviewJob: { ...base.reviewJob!, status: "failed" as const } };
    expect(reviewNotice(failed).title).toBe("Date review unavailable");
    expect(reviewPollMs(failed)).toBe(false);
    expect(reviewPollMs({ ...base, status: "evaluated", reviewStatus: "ready" })).toBe(false);
  });
});

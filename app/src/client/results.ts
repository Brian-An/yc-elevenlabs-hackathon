import type { DateSessionDTO, DateSessionSummary } from "../server/dto";
import type { DateReview } from "../shared/dateReview";
import type { Persona, Scenario, SkillName } from "../shared/types";

export type SkillScores = Partial<Record<SkillName, number>>;

export function assessedScores(review: DateReview): SkillScores {
  return Object.fromEntries(Object.entries(review.skills)
    .filter(([, assessment]) => assessment.score !== null)
    .map(([skill, assessment]) => [skill, assessment.score]));
}

export type SessionSummary = {
  id: string;
  persona: Persona;
  scenario: Scenario;
  startedAt: string;
  durationSec?: number;
  scores?: SkillScores;
  overallScore?: number;
  rubricVersion?: string;
};

type NoticeSession = Pick<DateSessionDTO, "kind" | "source" | "status" | "reviewStatus" | "transcript" | "reviewJob">;

/** Whether the background review for this date may still finish. */
export function reviewInProgress(session: Pick<DateSessionDTO, "status" | "reviewStatus"> | undefined): boolean {
  return session?.status === "ended" && (session.reviewStatus === "pending" || session.reviewStatus === "processing");
}

/** How often to check an unfinished review: often while it runs, rarely while it waits for a scheduled retry. */
export function reviewPollMs(session: NoticeSession | undefined): number | false {
  if (!reviewInProgress(session)) return false;
  const job = session?.reviewJob;
  return job?.status === "queued" && job.failureClass ? 30_000 : 3_000;
}

const timeOfDay = (date: Date) => date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function reviewNotice(session: NoticeSession) {
  if (session.kind === "coaching") return { title: "Coaching session complete", description: "Your conversation is saved." };
  if (session.source === "demo") return { title: "Demo complete", description: "This conversation used sample dialogue. Practice scores come from live dates." };
  const job = session.reviewJob;
  if (session.reviewStatus === "failed") {
    return {
      title: "Date review unavailable",
      description: job?.failureClass === "rejected"
        ? "The review service turned down the request. Your conversation is saved."
        : "We couldn't finish the review after several tries. Your conversation is saved.",
    };
  }
  if (session.reviewStatus === "skipped" || !session.transcript.some((turn) => turn.speaker === "user")) {
    return { title: "Conversation saved", description: "There was too little conversation to assess." };
  }
  if (job?.failureClass === "not_configured") {
    return { title: "Date review waiting", description: "Reviews are offline. We'll review your saved conversation when they're back." };
  }
  if (job?.status === "queued" && job.failureClass && job.nextAttemptAt) {
    return {
      title: "Date review delayed",
      description: `The review service is busy. We'll try again at ${timeOfDay(job.nextAttemptAt)}. Your conversation is saved.`,
    };
  }
  return { title: "Reviewing your date", description: "This usually takes under a minute. Your conversation is saved, so you can leave." };
}

export function completedSessions(sessions: DateSessionSummary[]): SessionSummary[] {
  return sessions
    .filter((s) => s.status !== "active" && s.kind === "date" && s.source !== "demo")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map((s) => {
      const legacyScores = s.replyCount > 0 ? s.evaluation?.scores : undefined;
      const legacyOverall = legacyScores && Math.round(Object.values(legacyScores).reduce((sum, score) => sum + score, 0) * 2.5);
      return {
        id: s.id,
        persona: s.persona ?? { id: s.personaId, name: "Your date", age: 0, bio: "", personality: "" },
        scenario: s.scenario,
        startedAt: s.startedAt.toISOString(),
        durationSec: s.endedAt ? Math.max(0, Math.floor((s.endedAt.getTime() - s.startedAt.getTime()) / 1000)) : undefined,
        scores: s.reviewScores ? s.reviewScores.scores : legacyScores,
        overallScore: s.reviewScores ? s.reviewScores.overallScore ?? undefined : legacyOverall,
        rubricVersion: s.reviewScores?.rubricVersion ?? (legacyScores ? "legacy" : undefined),
      };
    });
}

export function previousScores(sessions: DateSessionSummary[], sessionId: string): SkillScores | undefined {
  const completed = completedSessions(sessions);
  const index = completed.findIndex((s) => s.id === sessionId);
  return index < 0 ? undefined : completed.slice(index + 1)
    .find((s) => s.rubricVersion === completed[index].rubricVersion && s.scores)?.scores;
}

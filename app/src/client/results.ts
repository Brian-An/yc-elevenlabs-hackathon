import type { DateSessionSummary } from "../server/dto";
import type { Persona, Scenario, SkillName } from "../shared/types";

export type SkillScores = Record<SkillName, number>;

export type SessionSummary = {
  id: string;
  persona: Persona;
  scenario: Scenario;
  startedAt: string;
  durationSec?: number;
  scores?: SkillScores;
};

/** Completed dates are history; an empty date keeps its transcript without inventing a score. */
export function completedSessions(sessions: DateSessionSummary[]): SessionSummary[] {
  return sessions
    .filter((session) => session.status === "evaluated")
    .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
    .map((session) => ({
      id: session.id,
      persona: session.persona ?? { id: session.personaId, name: "Your date", age: 0, bio: "", personality: "" },
      scenario: session.scenario,
      startedAt: session.startedAt.toISOString(),
      durationSec: session.endedAt ? Math.max(0, Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)) : undefined,
      scores: session.replyCount > 0 ? session.evaluation?.scores : undefined,
    }));
}

/** Comparisons use the date before this one, even when reviewing an older result. */
export function previousScores(sessions: DateSessionSummary[], sessionId: string): SkillScores | undefined {
  const completed = completedSessions(sessions);
  const index = completed.findIndex((session) => session.id === sessionId);
  return index < 0 ? undefined : completed.slice(index + 1).find((session) => session.scores)?.scores;
}

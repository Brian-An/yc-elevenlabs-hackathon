// UserMemory stores a projection of completed reviews. Older, unattributed scores stay in date history.
import type { Prisma } from "@prisma/client";
import { prisma } from "wasp/server";
import type { UserMemory } from "wasp/entities";
import type { DateReview } from "../shared/dateReview";
import type { SkillName } from "../shared/types";
import type { MemoryPoint, MemorySnapshot, SkillHistoryEntry, SkillProfile } from "./dto";
import { SKILLS } from "./evaluator";
import { asJson, readJson } from "./serialize";

const MAX_POINTS = 10;
const PROFILE_WINDOW = 3;

function buildSkillProfile(history: SkillHistoryEntry[]): SkillProfile | null {
  const recent = history.slice(-PROFILE_WINDOW);
  const profile: SkillProfile = {};
  for (const skill of SKILLS) {
    const scores = recent.flatMap((entry) => entry.scores[skill] ?? []);
    if (scores.length) {
      profile[skill] = Math.round(scores.reduce((sum, score) => sum + score, 0) * 10 / scores.length) / 100;
    }
  }
  return Object.keys(profile).length ? profile : null;
}

function weakest(profile: SkillProfile | null): SkillName | null {
  if (!profile) return null;
  return SKILLS.filter((skill) => profile[skill] != null)
    .sort((a, b) => profile[a]! - profile[b]!)[0] ?? null;
}

function snapshot(row: UserMemory | null): MemorySnapshot {
  const skillHistory = readJson<SkillHistoryEntry[]>(row?.skillHistory, []).filter((entry) => entry.rubricVersion);
  const reviewed = new Set(skillHistory.map((entry) => entry.sessionId));
  const skillProfile = buildSkillProfile(skillHistory);
  return {
    skillProfile,
    trainingFocus: weakest(skillProfile),
    strengths: readJson<MemoryPoint[]>(row?.strengths, []).filter((point) => reviewed.has(point.sessionId)),
    weaknesses: readJson<MemoryPoint[]>(row?.weaknesses, []).filter((point) => reviewed.has(point.sessionId)),
    skillHistory,
    sessionsCount: skillHistory.length,
  };
}

export async function getMemory(userId: string): Promise<MemorySnapshot> {
  return snapshot(await prisma.userMemory.findUnique({ where: { userId } }));
}

export async function saveReviewMemory(
  tx: Prisma.TransactionClient,
  userId: string,
  review: DateReview,
  meta: { sessionId: string; personaId: string; endedAt: Date },
): Promise<void> {
  if (review.overallScore === null) return;
  // Serialize a user's concurrent reviews even before their first UserMemory row exists.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const current = await tx.userMemory.findUnique({ where: { userId } });
  const at = meta.endedAt.toISOString();
  const scores: Partial<Record<SkillName, number>> = {};
  for (const skill of SKILLS) {
    const score = review.skills[skill].score;
    if (score != null) scores[skill] = score;
  }
  const mergePoints = (previous: MemoryPoint[], next: DateReview["strengths"]) =>
    [...next.map(({ point, quote, skill }) => ({ point, quote, skill, sessionId: meta.sessionId, at })),
      ...previous.filter((point) => point.sessionId !== meta.sessionId)]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, MAX_POINTS);
  const prior = snapshot(current);
  const extended = [
    ...readJson<SkillHistoryEntry[]>(current?.skillHistory, []).filter((entry) => entry.sessionId !== meta.sessionId),
    { sessionId: meta.sessionId, personaId: meta.personaId, at, scores, rubricVersion: review.rubricVersion },
  ].sort((a, b) => a.at.localeCompare(b.at) || a.sessionId.localeCompare(b.sessionId));
  const history = extended.filter((entry) => entry.rubricVersion);
  const skillProfile = buildSkillProfile(history);
  const data = {
    skillProfile: asJson(skillProfile ?? {}),
    trainingFocus: weakest(skillProfile),
    strengths: asJson(mergePoints(prior.strengths, review.strengths)),
    weaknesses: asJson(mergePoints(prior.weaknesses, review.weaknesses)),
    skillHistory: asJson(extended),
    sessionsCount: history.length,
  };
  await tx.userMemory.upsert({ where: { userId }, create: { userId, ...data }, update: data });
}

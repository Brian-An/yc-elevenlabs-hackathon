// User memory: skill profile, training focus, strengths, weaknesses and skill history.
// PostgreSQL (the UserMemory table) is the single source of truth.
import { prisma } from "wasp/server";
import type { UserMemory } from "wasp/entities";
import type { Evaluation, SkillName } from "../shared/types";
import type { MemoryPoint, MemorySnapshot, SkillHistoryEntry, SkillProfile } from "./dto";
import { SKILLS } from "./evaluator";
import { asJson, readJson } from "./serialize";

const MAX_POINTS = 10;
const PROFILE_WINDOW = 3; // sessions averaged into the skill profile

/** Averages the last few sessions' scores (1–10) into a 0..1 profile. */
function buildSkillProfile(history: SkillHistoryEntry[]): SkillProfile | null {
  const recent = history.slice(-PROFILE_WINDOW);
  if (!recent.length) return null;
  return Object.fromEntries(
    SKILLS.map((s) => {
      const avg = recent.reduce((a, e) => a + (e.scores[s] ?? 0), 0) / recent.length;
      return [s, Math.round((avg / 10) * 100) / 100];
    }),
  ) as SkillProfile;
}

const weakest = (profile: SkillProfile): SkillName => [...SKILLS].sort((a, b) => profile[a] - profile[b])[0];

function snapshot(row: UserMemory | null): MemorySnapshot {
  const skillHistory = readJson<SkillHistoryEntry[]>(row?.skillHistory, []);
  const skillProfile = buildSkillProfile(skillHistory);
  return {
    skillProfile,
    trainingFocus: (row?.trainingFocus as SkillName | null) ?? (skillProfile ? weakest(skillProfile) : null),
    strengths: readJson<MemoryPoint[]>(row?.strengths, []),
    weaknesses: readJson<MemoryPoint[]>(row?.weaknesses, []),
    skillHistory,
    sessionsCount: row?.sessionsCount ?? 0,
  };
}

export async function getMemory(userId: number): Promise<MemorySnapshot> {
  const row = await prisma.userMemory.findUnique({ where: { userId } });
  return snapshot(row);
}

export async function saveMemory(
  userId: number,
  evaluation: Evaluation,
  meta: { sessionId: string; personaId: string },
): Promise<MemorySnapshot> {
  const current = await getMemory(userId);
  const at = new Date().toISOString();

  // Map an evidenced point to the skill it most likely refers to (by score rank).
  const ranked = [...SKILLS].sort((a, b) => evaluation.scores[a] - evaluation.scores[b]);
  const tag = (list: typeof evaluation.strengths, order: SkillName[]): MemoryPoint[] =>
    list.map((p, i) => ({ ...p, skill: order[i], sessionId: meta.sessionId, at }));

  const strengths = [...tag(evaluation.strengths, [...ranked].reverse()), ...current.strengths].slice(0, MAX_POINTS);
  const weaknesses = [...tag(evaluation.weaknesses, ranked), ...current.weaknesses].slice(0, MAX_POINTS);
  const skillHistory = [
    ...current.skillHistory.filter((e) => e.sessionId !== meta.sessionId),
    { sessionId: meta.sessionId, personaId: meta.personaId, at, scores: evaluation.scores },
  ];
  const skillProfile = buildSkillProfile(skillHistory)!;

  const data = {
    skillProfile: asJson(skillProfile),
    trainingFocus: weakest(skillProfile),
    strengths: asJson(strengths),
    weaknesses: asJson(weaknesses),
    skillHistory: asJson(skillHistory),
    sessionsCount: skillHistory.length,
  };
  const row = await prisma.userMemory.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return snapshot(row);
}

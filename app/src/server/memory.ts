// User memory: strengths, weaknesses and skill history.
// UserMemory (SQLite) is the source of truth for the app; Rowboat gets a copy
// when ROWBOAT_API_KEY is set. Rowboat failures never break the date flow.
import { prisma } from "wasp/server";
import type { Evaluation, SkillName } from "../shared/types";
import type { MemoryPoint, MemorySnapshot, SkillHistoryEntry } from "./dto";
import { SKILLS } from "./evaluator";
import { parseJson } from "./serialize";

const MAX_POINTS = 10;

export const rowboatEnabled = () => Boolean(process.env.ROWBOAT_API_KEY);

function snapshot(row: {
  strengths: string;
  weaknesses: string;
  skillHistory: string;
  sessionsCount: number;
} | null): MemorySnapshot {
  const skillHistory = parseJson<SkillHistoryEntry[]>(row?.skillHistory, []);
  const recent = skillHistory.slice(-3);
  let averages: Record<SkillName, number> | null = null;
  let weakestSkill: SkillName | null = null;
  if (recent.length) {
    averages = Object.fromEntries(
      SKILLS.map((s) => [s, Math.round((recent.reduce((a, e) => a + (e.scores[s] ?? 0), 0) / recent.length) * 10) / 10]),
    ) as Record<SkillName, number>;
    weakestSkill = [...SKILLS].sort((a, b) => averages![a] - averages![b])[0];
  }
  return {
    strengths: parseJson<MemoryPoint[]>(row?.strengths, []),
    weaknesses: parseJson<MemoryPoint[]>(row?.weaknesses, []),
    skillHistory,
    sessionsCount: row?.sessionsCount ?? 0,
    averages,
    weakestSkill,
    rowboatEnabled: rowboatEnabled(),
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

  const data = {
    strengths: JSON.stringify(strengths),
    weaknesses: JSON.stringify(weaknesses),
    skillHistory: JSON.stringify(skillHistory),
    sessionsCount: skillHistory.length,
  };
  const row = await prisma.userMemory.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  const snap = snapshot(row);

  // Fire and forget: the demo must not wait on (or fail because of) Rowboat.
  if (rowboatEnabled()) {
    void pushToRowboat(userId, evaluation, snap).catch((err) =>
      console.warn("[rowboat] memory sync failed:", err instanceof Error ? err.message : err),
    );
  }
  return snap;
}

// ---------------------------------------------------------------------------
// Rowboat
//
// TODO(rowboat): API NOT CONFIRMED. Docs (docs.rowboatlabs.com) were unreachable
// while building this. The call below follows the previously documented chat
// API: POST {ROWBOAT_API_HOST}/api/v1/{ROWBOAT_PROJECT_ID}/chat with
// `Authorization: Bearer {ROWBOAT_API_KEY}` and `{ messages: [{role, content}] }`.
// Verify the path/body against your Rowboat project's "Developer configs" page,
// and point the Rowboat workflow at a memory/notes tool for it to store this.
// Only this function (and recallFromRowboat) need to change.
// ---------------------------------------------------------------------------

function rowboatUrl(): string | null {
  const host = (process.env.ROWBOAT_API_HOST ?? "https://api.rowboatlabs.com").replace(/\/$/, "");
  const project = process.env.ROWBOAT_PROJECT_ID;
  return project ? `${host}/api/v1/${project}/chat` : null;
}

async function rowboatChat(content: string): Promise<unknown> {
  const url = rowboatUrl();
  if (!url) throw new Error("ROWBOAT_PROJECT_ID is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ROWBOAT_API_KEY}`,
    },
    body: JSON.stringify({ messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Rowboat ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function pushToRowboat(userId: number, evaluation: Evaluation, snap: MemorySnapshot): Promise<void> {
  await rowboatChat(
    [
      `Remember this about dating-practice user ${userId}.`,
      `Latest scores: ${JSON.stringify(evaluation.scores)}.`,
      `Strengths: ${evaluation.strengths.map((s) => s.point).join("; ") || "none"}.`,
      `Weaknesses: ${evaluation.weaknesses.map((w) => w.point).join("; ") || "none"}.`,
      `Weakest skill over recent sessions: ${snap.weakestSkill ?? "unknown"}.`,
    ].join("\n"),
  );
}

/** Asks Rowboat what it remembers about the user. Returns null when disabled or on error. */
export async function recallFromRowboat(userId: number): Promise<unknown | null> {
  if (!rowboatEnabled()) return null;
  try {
    return await rowboatChat(`What do you remember about dating-practice user ${userId}'s strengths and weaknesses?`);
  } catch (err) {
    console.warn("[rowboat] recall failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

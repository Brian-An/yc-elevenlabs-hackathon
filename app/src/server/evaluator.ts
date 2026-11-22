// Transcript evaluation + adaptive scenario generation.
//
// evaluateMoves scores a date from Jev's per-turn grades (src/server/moves.ts).
// evaluateTranscript is the rule-based fallback for when Jev is not configured or graded nothing.
import type {
  Difficulty,
  Evaluation,
  EvidencedPoint,
  MoveEvaluation,
  Scenario,
  SkillName,
  Transcript,
  TranscriptTurn,
} from "../shared/types";
import type { MemorySnapshot } from "./dto";
import { PERSONA_FOR_SKILL, getPersona } from "./personas";

export const SKILLS: SkillName[] = ["listening", "engagement", "confidence", "flow"];

const STOPWORDS = new Set(
  "the a an and or but so to of in on at for with is are was were be been it its i you me my your we our they them that this what how do did have has had just really like not no yes yeah oh um uh".split(
    " ",
  ),
);
const HEDGES = ["um", "uh", "i guess", "maybe", "sorry", "i don't know", "idk", "kind of", "sort of", "i mean"];

const clamp = (n: number) => Math.max(1, Math.min(10, Math.round(n)));
const words = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? [];
const contentWords = (s: string) => new Set(words(s).filter((w) => w.length > 2 && !STOPWORDS.has(w)));
const hedgeCount = (s: string) => {
  const l = ` ${s.toLowerCase()} `;
  return HEDGES.reduce((n, h) => n + (l.includes(` ${h} `) || l.includes(` ${h},`) ? 1 : 0), 0);
};

type Scored = { turn: TranscriptTurn; prevAgent?: TranscriptTurn; echoes: boolean; question: boolean; len: number; hedges: number };

export async function evaluateTranscript(transcript: Transcript, scenario: Scenario): Promise<Evaluation> {
  const scored: Scored[] = [];
  let prevAgent: TranscriptTurn | undefined;
  for (const turn of transcript) {
    if (turn.speaker === "agent") {
      prevAgent = turn;
      continue;
    }
    const prevWords = prevAgent ? contentWords(prevAgent.text) : new Set<string>();
    const echoes = [...contentWords(turn.text)].some((w) => prevWords.has(w));
    scored.push({
      turn,
      prevAgent,
      echoes,
      question: turn.text.includes("?"),
      len: words(turn.text).length,
      hedges: hedgeCount(turn.text),
    });
  }

  const name = getPersona(scenario.personaId)?.name ?? "your date";

  if (scored.length === 0) {
    const scores = { listening: 1, engagement: 1, confidence: 1, flow: 1 };
    return {
      scores,
      strengths: [],
      weaknesses: SKILLS.map((s) => ({ point: `No ${s} to assess: you didn't speak during the date.`, quote: "" })),
      summary: `The date with ${name} ended before you said anything. Try again and open with a question about the setting.`,
    };
  }

  const n = scored.length;
  const ratio = (f: (s: Scored) => boolean) => scored.filter(f).length / n;
  const avgLen = scored.reduce((a, s) => a + s.len, 0) / n;
  const hedgeRate = scored.reduce((a, s) => a + s.hedges, 0) / n;
  const shortRate = ratio((s) => s.len < 4);
  const gaps = scored
    .filter((s) => s.prevAgent)
    .map((s) => s.turn.timestamp - (s.prevAgent as TranscriptTurn).timestamp);
  const slowRate = gaps.length ? gaps.filter((g) => g > 8000).length / gaps.length : 0;

  const scores: Record<SkillName, number> = {
    listening: clamp(3 + 7 * ratio((s) => s.echoes)),
    engagement: clamp(3 + 12 * ratio((s) => s.question)),
    confidence: clamp(4 + Math.min(avgLen, 20) / 4 - hedgeRate * 3),
    flow: clamp(9 - 5 * shortRate - 4 * slowRate),
  };

  // Best/worst example quote per skill.
  const pick = (skill: SkillName, best: boolean): string => {
    const by: Record<SkillName, (s: Scored) => number> = {
      listening: (s) => (s.echoes ? 1 : 0) + s.len / 100,
      engagement: (s) => (s.question ? 1 : 0) + s.len / 100,
      confidence: (s) => Math.min(s.len, 20) / 20 - s.hedges,
      flow: (s) => Math.min(s.len, 15) / 15,
    };
    const sorted = [...scored].sort((a, b) => by[skill](b) - by[skill](a));
    return (best ? sorted[0] : sorted[sorted.length - 1]).turn.text;
  };

  const good = strengthCopy(name);
  const bad = weaknessCopy(name);

  const ranked = [...SKILLS].sort((a, b) => scores[b] - scores[a]);
  const strengths: EvidencedPoint[] = ranked
    .slice(0, 2)
    .filter((s) => scores[s] >= 5)
    .map((s) => ({ point: good[s], quote: pick(s, true) }));
  const weaknesses: EvidencedPoint[] = ranked
    .slice(-2)
    .reverse()
    .filter((s) => scores[s] <= 7)
    .map((s) => ({ point: bad[s], quote: pick(s, false) }));

  return { scores, strengths, weaknesses, summary: summarize(n, name, scores, ranked) };
}

const strengthCopy = (name: string): Record<SkillName, string> => ({
  listening: `You picked up on what ${name} said and built on it.`,
  engagement: `You showed curiosity by asking ${name} questions.`,
  confidence: "You spoke in full, committed sentences.",
  flow: "You kept the conversation moving without long stalls.",
});

const weaknessCopy = (name: string): Record<SkillName, string> => ({
  listening: `Several replies didn't connect to what ${name} had just said.`,
  engagement: `You rarely asked ${name} about their life or interests.`,
  confidence: "Hedging and very short answers made you sound unsure.",
  flow: "Short answers and long pauses made the conversation stall.",
});

/** `ranked` is SKILLS sorted by score, best first. */
function summarize(
  replies: number,
  name: string,
  scores: Record<SkillName, number>,
  ranked: SkillName[],
): string {
  const top = ranked[0];
  const low = ranked[ranked.length - 1];
  return `Your date with ${name} included ${replies} ${replies === 1 ? "reply" : "replies"}. Your strongest skill was ${top} (${scores[top]}/10). Next time, focus on ${low} (${scores[low]}/10).`;
}

/** Scores a date from Jev's per-turn grades: each skill is the average of its per-move scores. */
export function evaluateMoves(transcript: Transcript, scenario: Scenario, moves: MoveEvaluation[]): Evaluation {
  const name = getPersona(scenario.personaId)?.name ?? "your date";
  const scores = Object.fromEntries(
    SKILLS.map((s) => [s, clamp(moves.reduce((a, m) => a + m.scores[s], 0) / moves.length)]),
  ) as Record<SkillName, number>;

  // The user's own words from the move that scored best (or worst) on a skill.
  const quote = (skill: SkillName, best: boolean): string => {
    const sorted = [...moves].sort((a, b) => b.scores[skill] - a.scores[skill]);
    const move = best ? sorted[0] : sorted[sorted.length - 1];
    return transcript[move.turnIndex]?.text ?? "";
  };

  const good = strengthCopy(name);
  const bad = weaknessCopy(name);
  const ranked = [...SKILLS].sort((a, b) => scores[b] - scores[a]);
  const strengths: EvidencedPoint[] = ranked
    .slice(0, 2)
    .filter((s) => scores[s] >= 5)
    .map((s) => ({ point: good[s], quote: quote(s, true) }));
  const weaknesses: EvidencedPoint[] = ranked
    .slice(-2)
    .reverse()
    .filter((s) => scores[s] <= 7)
    .map((s) => ({ point: bad[s], quote: quote(s, false) }));

  return { scores, strengths, weaknesses, summary: summarize(moves.length, name, scores, ranked) };
}

const SETTINGS: Record<SkillName, { setting: string; opening: string }> = {
  listening: {
    setting: "Bookshop café: your date mentions a few personal details in passing. Remember them and follow up.",
    opening: "Sorry, I'm a bit frazzled, my sister just called about her wedding plans. Anyway, hi!",
  },
  engagement: {
    setting: "Quiet bar: your date gives short answers until you ask genuinely curious questions.",
    opening: "Hey. So... this place is fine, I guess.",
  },
  confidence: {
    setting: "Busy restaurant: your date challenges vague answers. Take a position and own it.",
    opening: "Okay, first question, and be honest: what's something you're weirdly proud of?",
  },
  flow: {
    setting: "Evening walk in the park: keep the conversation moving with no table or menu to lean on.",
    opening: "Nice night for a walk. So, how was your day?",
  },
};

/** Builds the next practice date aimed at the user's weakest skill. */
export function generateNextScenario(memory: MemorySnapshot, preferredPersonaId?: string): Scenario {
  const skill: SkillName = memory.trainingFocus ?? "engagement";
  const personaId =
    preferredPersonaId && getPersona(preferredPersonaId) ? preferredPersonaId : PERSONA_FOR_SKILL[skill];
  const profile = memory.skillProfile;
  const avg = profile ? SKILLS.reduce((a, s) => a + profile[s], 0) / SKILLS.length : 0;
  const difficulty: Difficulty = !profile || avg < 0.5 ? "easy" : avg < 0.75 ? "medium" : "hard";
  const t = SETTINGS[skill];
  return {
    id: `next-${skill}-${memory.sessionsCount + 1}`,
    personaId,
    setting: t.setting,
    difficulty,
    targetWeakness: skill,
    openingLine: t.opening,
  };
}

import type { Difficulty, Scenario, SkillName } from "../shared/types";
import type { MemorySnapshot } from "./dto";
import { PERSONA_FOR_SKILL, getPersona } from "./personas";

export const SKILLS: SkillName[] = ["listening", "engagement", "confidence", "flow"];

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
  const observed = Object.values(memory.skillProfile ?? {});
  const avg = observed.length ? observed.reduce((sum, score) => sum + score, 0) / observed.length : 0;
  const difficulty: Difficulty = avg < 0.5 ? "easy" : avg < 0.75 ? "medium" : "hard";
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

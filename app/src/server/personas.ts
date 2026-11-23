// Hard-coded fictional personas, plus characters users generate (CustomPersona rows).
// A stock persona can use its own ElevenLabs agent via ELEVENLABS_AGENT_ID_<ID> (e.g. ELEVENLABS_AGENT_ID_MAYA);
// generated characters share ELEVENLABS_AGENT_ID_CUSTOM and get their voice as a per-session override.
// Without a dedicated agent, the server falls back to ELEVENLABS_AGENT_ID.
import type { CustomPersona } from "wasp/entities";
import { prisma } from "wasp/server";
import type { Difficulty, Persona, PersonaLook, PersonaProvenance, Scenario, SkillName } from "../shared/types";
import type { PersonaWithScenario } from "./dto";
import { readJson } from "./serialize";

type PersonaDef = Persona & { difficulty: Difficulty; defaultScenario: Scenario };

const PERSONAS: PersonaDef[] = [
  {
    id: "maya",
    name: "Maya",
    age: 27,
    bio: "UX designer who spends weekends at farmers' markets and is learning ceramics.",
    personality:
      "Warm, curious and encouraging. Asks follow-up questions and laughs easily. Forgiving of awkward pauses.",
    difficulty: "easy",
    defaultScenario: {
      id: "maya-coffee",
      personaId: "maya",
      setting: "Sunday afternoon coffee shop, first date after matching online",
      difficulty: "easy",
      openingLine: "Hi! You found it okay? I've been eyeing their cinnamon buns since I walked in.",
    },
  },
  {
    id: "theo",
    name: "Theo",
    age: 31,
    bio: "Line cook at a busy bistro, dry sense of humor, plays bass in a bar band.",
    personality:
      "Witty and a little guarded. Gives short answers until you show real interest, teases you to see if you can banter.",
    difficulty: "medium",
    defaultScenario: {
      id: "theo-wine-bar",
      personaId: "theo",
      setting: "Dim wine bar on a weeknight, second date",
      difficulty: "medium",
      openingLine: "So. You came back for round two. Brave.",
    },
  },
  {
    id: "priya",
    name: "Priya",
    age: 29,
    bio: "ER doctor just off a twelve-hour shift, runs marathons, has strong opinions about books.",
    personality:
      "Direct, sharp and easily bored. Challenges vague answers, changes topic if the conversation drags, respects confidence.",
    difficulty: "hard",
    defaultScenario: {
      id: "priya-rooftop",
      personaId: "priya",
      setting: "Crowded rooftop bar after her shift, first date",
      difficulty: "hard",
      openingLine: "Sorry I'm late, the ER was chaos. Tell me something interesting before I fall asleep.",
    },
  },
  {
    id: "coach",
    name: "Riley",
    age: 34,
    bio: "Dating coach who has helped hundreds of people build real confidence and connection skills.",
    personality:
      "Encouraging, direct and practical. Gives concrete, actionable feedback instead of vague compliments. Asks good follow-up questions before giving advice.",
    difficulty: "easy",
    defaultScenario: {
      id: "coach-chat",
      personaId: "coach",
      setting: "A casual coaching chat, not a date -- talk through what's been going on with dating",
      difficulty: "easy",
      openingLine: "Hey, good to see you! So, what's been going on with dating lately?",
    },
  },
];

function withAgentId(p: PersonaDef): PersonaWithScenario {
  const agentId = process.env[`ELEVENLABS_AGENT_ID_${p.id.toUpperCase()}`];
  return { ...p, ...(agentId ? { elevenLabsAgentId: agentId } : {}) };
}

export function listPersonas(): PersonaWithScenario[] {
  return PERSONAS.map(withAgentId);
}

/** A stock persona. Use resolvePersona or personaLookup when the id may belong to a generated character. */
export function getPersona(id: string): PersonaWithScenario | undefined {
  const p = PERSONAS.find((x) => x.id === id);
  return p ? withAgentId(p) : undefined;
}

/** A persona plus the call settings that stay on the server. */
export type ResolvedPersona = {
  persona: PersonaWithScenario;
  /** ElevenLabs voice to override the agent's own, for generated characters. */
  voiceId: string | null;
  /** LiveAvatar avatar matched to a generated character. */
  avatarId: string | null;
  /** The story or choice the character brings into the conversation. */
  direction: string | null;
};

const customAgentId = () => process.env.ELEVENLABS_AGENT_ID_CUSTOM || undefined;

export function fromCustomPersona(row: CustomPersona, avatarPreviewUrl: string | null = null): ResolvedPersona {
  const difficulty = row.difficulty as Difficulty;
  const agentId = customAgentId();
  const persona: PersonaWithScenario = {
    id: row.id,
    name: row.name,
    age: row.age,
    bio: row.bio,
    personality: row.personality,
    ...(agentId ? { elevenLabsAgentId: agentId } : {}),
    difficulty,
    defaultScenario: { id: `custom-${row.id}`, personaId: row.id, setting: row.setting, difficulty, openingLine: row.openingLine },
    custom: {
      gender: row.gender as NonNullable<Persona["custom"]>["gender"],
      look: readJson<PersonaLook>(row.look, { model: "Casual2_Female", skin: "#d9a47f", hair: "#2b2018" }),
      appearance: row.appearance,
      voiceName: row.voiceName,
      avatarPreviewUrl,
      provenance: readJson<PersonaProvenance>(row.provenance, {} as PersonaProvenance),
      createdAt: row.createdAt,
      deleted: row.deletedAt !== null,
    },
  };
  return { persona, voiceId: row.voiceId, avatarId: row.avatarId, direction: row.direction };
}

const stockResolved = (persona: PersonaWithScenario): ResolvedPersona =>
  ({ persona, voiceId: null, avatarId: null, direction: null });

async function avatarPreviews(rows: CustomPersona[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.flatMap((row) => (row.avatarId ? [row.avatarId] : [])))];
  if (!ids.length) return new Map();
  const profiles = await prisma.avatarProfile.findMany({ where: { avatarId: { in: ids } }, select: { avatarId: true, previewUrl: true } });
  return new Map(profiles.map((profile) => [profile.avatarId, profile.previewUrl]));
}

/**
 * Resolves the personas a user can see: every stock persona and that user's generated characters,
 * deleted ones included so date history keeps their names. Another user's character never resolves.
 */
export async function personaLookup(userId: string, ids?: string[]): Promise<(id: string) => ResolvedPersona | undefined> {
  const customIds = ids?.filter((id) => !getPersona(id));
  const rows = customIds && customIds.length === 0 ? [] : await prisma.customPersona.findMany({
    where: { userId, ...(customIds ? { id: { in: customIds } } : {}) },
  });
  const previews = await avatarPreviews(rows);
  const custom = new Map(rows.map((row) => [row.id, fromCustomPersona(row, row.avatarId ? previews.get(row.avatarId) ?? null : null)]));
  return (id) => {
    const stock = getPersona(id);
    return stock ? stockResolved(stock) : custom.get(id);
  };
}

export async function resolvePersona(id: string, userId: string): Promise<ResolvedPersona | undefined> {
  return (await personaLookup(userId, [id]))(id);
}

/** Stock personas, then the user's active generated characters, newest first. */
export async function listPersonasFor(userId: string | null): Promise<PersonaWithScenario[]> {
  if (!userId) return listPersonas();
  const rows = await prisma.customPersona.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  const previews = await avatarPreviews(rows);
  return [...listPersonas(), ...rows.map((row) => fromCustomPersona(row, row.avatarId ? previews.get(row.avatarId) ?? null : null).persona)];
}

// Which persona best stresses each skill (used by generateNextScenario).
export const PERSONA_FOR_SKILL: Record<SkillName, string> = {
  listening: "theo", // drops small details you need to pick up on
  engagement: "theo", // short answers until you draw him out
  confidence: "priya", // pushes back on vague answers
  flow: "maya", // gentle setting to practise keeping things moving
};

// Hard-coded fictional personas, plus characters users generate (CustomPersona rows).
// A stock persona can use its own ElevenLabs agent via ELEVENLABS_AGENT_ID_<ID> (e.g. ELEVENLABS_AGENT_ID_MAYA);
// generated characters share ELEVENLABS_AGENT_ID_CUSTOM and get their voice as a per-session override.
// Without a dedicated agent, the server falls back to ELEVENLABS_AGENT_ID.
import type { CustomPersona } from "wasp/entities";
import { prisma } from "wasp/server";
import type { Difficulty, Persona, PersonaLook, PersonaProvenance, SkillName } from "../shared/types";
import type { PersonaWithScenario } from "./dto";
import { readJson } from "./serialize";
import { PERSONAS, type PersonaDef } from "./stockPersonas";

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
  /** Anam avatar matched to a generated character. */
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

/** The Anam avatar a stock persona appears as on a call, from ANAM_AVATAR_ID_<ID>. */
const stockAvatarId = (personaId: string) => process.env[`ANAM_AVATAR_ID_${personaId.toUpperCase()}`] || undefined;

/** Each stock persona's portrait: the preview of the video avatar it appears as, by persona id. */
async function stockPhotos(): Promise<Map<string, string>> {
  const avatars = PERSONAS.flatMap((p) => { const avatarId = stockAvatarId(p.id); return avatarId ? [[p.id, avatarId] as const] : []; });
  if (!avatars.length) return new Map();
  const profiles = await prisma.avatarProfile.findMany({
    where: { avatarId: { in: avatars.map(([, avatarId]) => avatarId) } }, select: { avatarId: true, previewUrl: true },
  });
  const preview = new Map(profiles.map((profile) => [profile.avatarId, profile.previewUrl]));
  return new Map(avatars.flatMap(([personaId, avatarId]) => { const url = preview.get(avatarId); return url ? [[personaId, url] as const] : []; }));
}

const withPhoto = (persona: PersonaWithScenario, photos: Map<string, string>): PersonaWithScenario => {
  const photoUrl = photos.get(persona.id);
  return photoUrl ? { ...persona, photoUrl } : persona;
};

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
  const [previews, photos] = await Promise.all([avatarPreviews(rows), stockPhotos()]);
  const custom = new Map(rows.map((row) => [row.id, fromCustomPersona(row, row.avatarId ? previews.get(row.avatarId) ?? null : null)]));
  return (id) => {
    const stock = getPersona(id);
    return stock ? stockResolved(withPhoto(stock, photos)) : custom.get(id);
  };
}

export async function resolvePersona(id: string, userId: string): Promise<ResolvedPersona | undefined> {
  return (await personaLookup(userId, [id]))(id);
}

/** Stock personas, then the user's active generated characters, newest first. */
export async function listPersonasFor(userId: string | null): Promise<PersonaWithScenario[]> {
  const photos = await stockPhotos();
  const stock = listPersonas().map((persona) => withPhoto(persona, photos));
  if (!userId) return stock;
  const rows = await prisma.customPersona.findMany({ where: { userId, deletedAt: null }, orderBy: { createdAt: "desc" } });
  const previews = await avatarPreviews(rows);
  return [...stock, ...rows.map((row) => fromCustomPersona(row, row.avatarId ? previews.get(row.avatarId) ?? null : null).persona)];
}

// Which persona best stresses each skill (used by generateNextScenario).
export const PERSONA_FOR_SKILL: Record<SkillName, string> = {
  listening: "theo", // drops small details you need to pick up on
  engagement: "theo", // short answers until you draw him out
  confidence: "priya", // pushes back on vague answers
  flow: "maya", // gentle setting to practise keeping things moving
};

// Operations for the practice characters a user generates. Every operation is scoped to the caller's user ID.
import Anthropic from "@anthropic-ai/sdk";
import type { Prisma } from "@prisma/client";
import { HttpError, prisma } from "wasp/server";
import type { DeleteCustomPersona, GenerateCustomPersona, UpdateCustomPersona } from "wasp/server/operations";
import { anthropicEnabled, GenerationError } from "./anthropic";
import { matchAvatar } from "./avatarCatalog";
import { generateCharacter, type CharacterRequest, type ExistingCharacter, type PracticeProfile } from "./characterGen";
import type { PersonaWithScenario } from "./dto";
import { fromCustomPersona, listPersonas } from "./personas";
import { asJson, readJson } from "./serialize";
import { SETTING_MAX_LENGTH } from "../shared/types";
import { ensureUser, userIdFrom, type WithUser } from "./user";
import { PERSONAS } from "./stockPersonas";
import { pickVoice } from "./voices";

export const MAX_ACTIVE_CHARACTERS = 12;
export const MAX_GENERATIONS_PER_DAY = 20;
/** How many of the user's past characters, retired ones included, a new character is kept distinct from. */
const DISTINCT_FROM_RECENT = 30;

export type GenerateCustomPersonaArgs = WithUser & Partial<Omit<CharacterRequest, "notes" | "profile" | "existing">> & {
  /** Empty asks for someone new, shaped by the user's profile. */
  notes?: string;
  /** A character to replace with the new one, when the user regenerates. */
  replaceId?: string;
};
export type UpdateCustomPersonaArgs = WithUser & { id: string; name?: string; setting?: string; openingLine?: string };

const GENDERS = ["woman", "man", "nonbinary"] as const;
const DIFFICULTIES = ["easy", "medium", "hard"] as const;

function optionalText(value: unknown, field: string, max: number): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length > max) throw new HttpError(400, `${field} must be at most ${max} characters`);
  return value.trim() || undefined;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  if (value == null || value === "") return undefined;
  if (!allowed.includes(value as T)) throw new HttpError(400, `${field} is not a valid choice`);
  return value as T;
}

/** Validates the form. Exported for tests. */
export function characterRequest(args: Partial<GenerateCustomPersonaArgs>): CharacterRequest {
  const notes = typeof args.notes === "string" ? args.notes.trim() : "";
  if (notes.length > 0 && notes.length < 3) throw new HttpError(400, "Describe them in a few more words, or leave it blank");
  if (notes.length > 2000) throw new HttpError(400, "Describe them in at most 2,000 characters");
  const age = args.age == null ? undefined : Number(args.age);
  if (age !== undefined && (!Number.isInteger(age) || age < 21 || age > 70)) throw new HttpError(400, "Age must be between 21 and 70");
  return {
    notes,
    gender: oneOf(args.gender, GENDERS, "Gender"),
    age,
    background: optionalText(args.background, "Background", 200),
    voice: optionalText(args.voice, "Voice", 200),
    difficulty: oneOf(args.difficulty, DIFFICULTIES, "Difficulty"),
    setting: optionalText(args.setting, "Setting", SETTING_MAX_LENGTH),
  };
}

const PRACTICES_WITH = ["women", "men", "anyone"] as const;

/** The onboarding answers that shape a character the notes leave open. */
function practiceProfile(user: { goals: string | null; experienceLevel: string | null; preferences: Prisma.JsonValue } | null): PracticeProfile {
  const preferences = readJson<Record<string, unknown>>(user?.preferences, {});
  const practicesWith = PRACTICES_WITH.find((value) => value === preferences.interestedIn);
  return {
    ...(practicesWith ? { practicesWith } : {}),
    ...(user?.goals ? { goals: user.goals } : {}),
    ...(user?.experienceLevel ? { experience: user.experienceLevel } : {}),
  };
}

/** The stock characters and the user's recent ones, so a new character is someone the user hasn't met. */
function existingCharacters(recent: { name: string; setting: string; bio: string }[]): ExistingCharacter[] {
  return [
    ...listPersonas().map((persona) => ({ name: persona.name, setting: persona.defaultScenario.setting, bio: persona.bio })),
    ...recent,
  ].map(({ name, setting, bio }) => ({ name, setting, bio: bio.slice(0, 160) }));
}

async function ownedCharacter(userId: string, id: unknown) {
  if (typeof id !== "string" || !id) throw new HttpError(400, "id is required");
  const row = await prisma.customPersona.findFirst({ where: { id, userId, deletedAt: null } });
  if (!row) throw new HttpError(404, "Character not found");
  return row;
}

async function withPreview(row: Parameters<typeof fromCustomPersona>[0]): Promise<PersonaWithScenario> {
  const preview = row.avatarId
    ? (await prisma.avatarProfile.findUnique({ where: { avatarId: row.avatarId }, select: { previewUrl: true } }))?.previewUrl ?? null
    : null;
  return fromCustomPersona(row, preview).persona;
}

export const generateCustomPersona: GenerateCustomPersona<GenerateCustomPersonaArgs, PersonaWithScenario> = async (args) => {
  const userId = await ensureUser(args);
  const form = characterRequest(args);
  if (!anthropicEnabled()) throw new HttpError(503, "Character generation is not configured on this server");
  const replaced = args.replaceId ? await ownedCharacter(userId, args.replaceId) : null;

  const [active, recent, others, past, user] = await Promise.all([
    prisma.customPersona.count({ where: { userId, deletedAt: null } }),
    prisma.customPersona.count({ where: { userId, createdAt: { gt: new Date(Date.now() - 24 * 60 * 60_000) } } }),
    prisma.customPersona.findMany({ where: { userId, deletedAt: null }, select: { voiceId: true } }),
    prisma.customPersona.findMany({
      where: { userId }, orderBy: { createdAt: "desc" }, take: DISTINCT_FROM_RECENT, select: { name: true, setting: true, bio: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { goals: true, experienceLevel: true, preferences: true } }),
  ]);
  if (!replaced && active >= MAX_ACTIVE_CHARACTERS) throw new HttpError(409, `You can keep up to ${MAX_ACTIVE_CHARACTERS} characters. Delete one to make another.`);
  if (recent >= MAX_GENERATIONS_PER_DAY) throw new HttpError(429, "You've created a lot of characters today. Try again tomorrow.");

  const profile = practiceProfile(user);
  // With nothing written, the character is someone the user practices with. Written notes may say otherwise.
  const surpriseGender = !form.notes && !form.gender && profile.practicesWith && profile.practicesWith !== "anyone"
    ? (profile.practicesWith === "women" ? "woman" : "man") : undefined;
  const request: CharacterRequest = { ...form, ...(surpriseGender ? { gender: surpriseGender } : {}), profile, existing: existingCharacters(past) };

  let generated: Awaited<ReturnType<typeof generateCharacter>>;
  try {
    generated = await generateCharacter(request);
  } catch (error) {
    if (error instanceof GenerationError) throw new HttpError(502, error.message);
    // Provider errors can echo the request, which holds the user's notes. Log the class only.
    console.error("[characters] generation failed", error instanceof Anthropic.APIError ? `HTTP ${error.status}` : error instanceof Error ? error.name : "unknown");
    throw new HttpError(502, "The character could not be generated. Try again.");
  }
  const { spec, look, provenance, model } = generated;
  // Stay clear of the stock personas' voices and the user's other characters', so nobody sounds like someone else.
  const taken = new Set([...PERSONAS.map((p) => p.voice.id), ...others.flatMap((row) => (row.voiceId ? [row.voiceId] : []))]);
  const voice = await pickVoice(spec.voice, taken);
  const avatarId = await matchAvatar(spec).catch((error: unknown) => {
    console.error("[characters] avatar match failed", error instanceof Error ? error.name : "unknown");
    return null;
  });

  const row = await prisma.$transaction(async (tx) => {
    // Regenerating replaces the draft: the old character is retired and its copy of the notes erased.
    if (replaced) await tx.customPersona.update({ where: { id: replaced.id }, data: { deletedAt: new Date(), notes: null } });
    return tx.customPersona.create({ data: {
      userId, name: spec.name, age: spec.age, gender: spec.gender, bio: spec.bio, personality: spec.personality,
      direction: spec.direction, difficulty: spec.difficulty, setting: spec.setting, openingLine: spec.openingLine,
      appearance: spec.appearance, look: asJson(look), voiceId: voice?.voiceId ?? null, voiceName: voice?.name ?? null,
      avatarId, provenance: asJson(provenance), notes: form.notes || null, model,
    } });
  });
  return withPreview(row);
};

/** Edits a character in place, without regenerating it. */
export const updateCustomPersona: UpdateCustomPersona<UpdateCustomPersonaArgs, PersonaWithScenario> = async (args) => {
  const userId = userIdFrom(args);
  const row = await ownedCharacter(userId, args?.id);
  const name = optionalText(args.name, "Name", 40);
  const setting = optionalText(args.setting, "Setting", SETTING_MAX_LENGTH);
  const openingLine = optionalText(args.openingLine, "Opening line", 200);
  const updated = await prisma.customPersona.update({
    where: { id: row.id },
    data: { ...(name ? { name } : {}), ...(setting ? { setting } : {}), ...(openingLine ? { openingLine } : {}) },
  });
  return withPreview(updated);
};

/**
 * Retires a character. Its name and description stay so past dates still read correctly, while the user's notes
 * and any detail the character was going to follow up on are erased.
 */
export const deleteCustomPersona: DeleteCustomPersona<WithUser & { id: string }, { id: string }> = async (args) => {
  const userId = userIdFrom(args);
  const row = await ownedCharacter(userId, args?.id);
  await prisma.$transaction([
    prisma.customPersona.update({ where: { id: row.id }, data: { deletedAt: new Date(), notes: null } }),
    prisma.personaCallback.deleteMany({ where: { userId, personaId: row.id } }),
  ]);
  return { id: row.id };
};

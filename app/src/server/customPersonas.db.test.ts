// Runs generated characters against a real PostgreSQL database with stubbed Anthropic and ElevenLabs responses.
// Set TEST_DATABASE_URL to a migrated, disposable database (see README). The suite deletes the users it creates.
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Transcript } from "../shared/types";
import type { CharacterSpec } from "./characterGen";

const databaseUrl = process.env.TEST_DATABASE_URL;
const { db, parse } = vi.hoisted(() => ({ db: { client: null as PrismaClient | null }, parse: vi.fn() }));

vi.mock("wasp/server", () => ({
  get prisma() { return db.client!; },
  HttpError: class HttpError extends Error {
    constructor(readonly statusCode: number, message?: string) { super(message); }
  },
}));
vi.mock("wasp/server/jobs", () => ({
  runDateReview: { submit: vi.fn(), delay: () => ({ submit: vi.fn() }) },
  refreshAvatarCatalog: { submit: vi.fn() },
}));
vi.mock("./anthropic", async (importOriginal) => ({
  ...await importOriginal<typeof import("./anthropic")>(),
  anthropic: () => ({ beta: { messages: { parse } } }),
}));

const { generateCustomPersona, deleteCustomPersona, MAX_ACTIVE_CHARACTERS } = await import("./customPersonas");
const { createDateSession, endDateSession, getPersonas, listDateSessions } = await import("./sessions");
const { resolveCallSession } = await import("./sessionBrief");

const spec = (name: string): CharacterSpec => ({
  name, age: 28, gender: "woman", appearance: "Shoulder-length black hair, light brown skin, denim jacket.",
  bio: "A climbing instructor who bakes sourdough.", personality: "Playful and quick.",
  direction: "When it fits, mention you froze on a route last week.", setting: "A bouldering gym café",
  openingLine: "You made it!", difficulty: "medium",
  voice: { gender: "female", age: "young", accent: "american", description: "warm" },
  look: { model: "Casual2_Female", skin: "#c68e63", hair: "#151313" },
  provenance: { name: "generated", age: "generated", gender: "notes", appearance: "generated", personality: "notes", interests: "notes", voice: "generated", setting: "generated" },
});

const voicesResponse = () => Response.json({
  voices: [
    { voice_id: "voice-british-man", name: "Oliver", labels: { gender: "male", accent: "british", age: "middle_aged" } },
    { voice_id: "voice-american-woman", name: "Jess", labels: { gender: "female", accent: "american", age: "young" }, description: "warm" },
  ],
  has_more: false,
});

const transcript: Transcript = [
  { speaker: "agent", text: "You made it!", timestamp: 0 },
  { speaker: "user", text: "I did. I'm taking a pottery class on Saturday, by the way.", timestamp: 1000 },
];

const users: string[] = [];
const newUser = () => { const id = randomUUID(); users.push(id); return id; };
const context = () => {
  const client = db.client!;
  return { entities: {
    User: client.user, DateSession: client.dateSession, Move: client.move, ReviewJob: client.reviewJob,
    UserMemory: client.userMemory, PersonaCallback: client.personaCallback, CustomPersona: client.customPersona,
  } } as never;
};
const generate = (userId: string, extra: object = {}) =>
  generateCustomPersona({ userId, notes: "She climbs, bakes sourdough and teases a lot.", ...extra }, context());

describe.skipIf(!databaseUrl)("generated characters (PostgreSQL)", () => {
  beforeAll(async () => {
    db.client = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.client.$connect();
  });

  afterAll(async () => {
    await db.client?.user.deleteMany({ where: { id: { in: users } } });
    await db.client?.$disconnect();
  });

  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_API_KEY", "test-key");
    vi.stubEnv("ELEVENLABS_AGENT_ID", "agent_shared");
    vi.stubEnv("ELEVENLABS_AGENT_ID_CUSTOM", "agent_custom");
    vi.stubEnv("ANAM_API_KEY", "");
    vi.stubGlobal("fetch", vi.fn(async () => voicesResponse()));
    parse.mockReset();
    parse.mockImplementation(async () => ({ stop_reason: "end_turn", model: "test-model", parsed_output: spec("Lena") }));
  });

  it("creates a private character with a matched voice that carries into the call", async () => {
    const owner = newUser();
    const persona = await generate(owner);
    expect(persona).toMatchObject({ name: "Lena", elevenLabsAgentId: "agent_custom", custom: { voiceName: "Jess", deleted: false, look: { model: "Casual2_Female" } } });
    expect(persona).not.toHaveProperty("voiceId");

    const listed = await getPersonas({ userId: owner }, context());
    expect(listed.map((p) => p.id)).toEqual(["maya", "theo", "priya", "coach", persona.id]);

    const session = await createDateSession({ userId: owner, personaId: persona.id }, context());
    expect(session).toMatchObject({ kind: "date", source: "live", agentId: "agent_custom", persona: { name: "Lena" } });
    const call = await resolveCallSession(session.id, owner);
    expect(call).toMatchObject({ agentId: "agent_custom", voiceId: "voice-american-woman", avatarId: null });
    if ("error" in call) throw new Error(call.error);
    expect(call.dynamicVariables.character_direction).toContain("froze on a route");
    expect(call.dynamicVariables.opening_line).toBe("You made it!");
  });

  it("never shows or starts another user's character", async () => {
    const owner = newUser();
    const stranger = newUser();
    const persona = await generate(owner);
    expect((await getPersonas({ userId: stranger }, context())).map((p) => p.id)).not.toContain(persona.id);
    await expect(createDateSession({ userId: stranger, personaId: persona.id }, context())).rejects.toThrow(/Unknown personaId/);
    await expect(deleteCustomPersona({ userId: stranger, id: persona.id }, context())).rejects.toThrow(/not found/);
  });

  it("erases the notes and pending follow-up on delete, and keeps past dates readable", async () => {
    const owner = newUser();
    const persona = await generate(owner);
    const session = await createDateSession({ userId: owner, personaId: persona.id }, context());
    await endDateSession({ userId: owner, id: session.id, transcript }, context());
    expect(await db.client!.personaCallback.count({ where: { userId: owner, personaId: persona.id } })).toBe(1);

    await deleteCustomPersona({ userId: owner, id: persona.id }, context());
    const row = await db.client!.customPersona.findUniqueOrThrow({ where: { id: persona.id } });
    expect(row.notes).toBeNull();
    expect(row.deletedAt).not.toBeNull();
    expect(await db.client!.personaCallback.count({ where: { userId: owner, personaId: persona.id } })).toBe(0);

    expect((await getPersonas({ userId: owner }, context())).map((p) => p.id)).not.toContain(persona.id);
    const [history] = await listDateSessions({ userId: owner }, context());
    expect(history.persona).toMatchObject({ name: "Lena", custom: { deleted: true } });
    await expect(createDateSession({ userId: owner, personaId: persona.id }, context())).rejects.toThrow(/Unknown personaId/);
  });

  it("replaces the draft when regenerating and enforces the character limit", async () => {
    const owner = newUser();
    const first = await generate(owner);
    parse.mockImplementation(async () => ({ stop_reason: "end_turn", model: "test-model", parsed_output: spec("Noor") }));
    const second = await generate(owner, { replaceId: first.id });
    expect(second.name).toBe("Noor");
    const retired = await db.client!.customPersona.findUniqueOrThrow({ where: { id: first.id } });
    expect(retired).toMatchObject({ notes: null });
    expect(retired.deletedAt).not.toBeNull();

    for (let i = 1; i < MAX_ACTIVE_CHARACTERS; i++) await generate(owner);
    await expect(generate(owner)).rejects.toThrow(/up to 12 characters/);
  });

  it("invents someone the user practices with when nothing is written, distinct from characters they have met", async () => {
    const owner = newUser();
    await generate(owner);
    await db.client!.user.update({ where: { id: owner }, data: { experienceLevel: "beginner", preferences: { interestedIn: "men" } } });
    parse.mockClear();
    const persona = await generate(owner, { notes: "" });

    const sent = JSON.parse(parse.mock.calls[0]![0].messages[0].content);
    expect(sent).toMatchObject({ notes: "", choices: { gender: "man" }, profile: { practicesWith: "men", experience: "beginner" } });
    expect(sent.existing.map((character: { name: string }) => character.name)).toEqual(expect.arrayContaining(["Maya", "Theo", "Lena"]));
    expect((await db.client!.customPersona.findUniqueOrThrow({ where: { id: persona.id } })).notes).toBeNull();
  });

  it("explains when generation is not configured, without calling the provider", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    await expect(generate(newUser())).rejects.toThrow(/not configured/);
    expect(parse).not.toHaveBeenCalled();
  });
});

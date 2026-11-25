import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterSpec } from "./characterGen";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("./anthropic", async (importOriginal) => ({
  ...await importOriginal<typeof import("./anthropic")>(),
  anthropic: () => ({ beta: { messages: { parse } } }),
}));

const { applyChoices, generateCharacter, plazaModelFor } = await import("./characterGen");

const spec: CharacterSpec = {
  name: "Lena", age: 28, gender: "woman", appearance: "Shoulder-length black hair, light brown skin, denim jacket.",
  bio: "A climbing instructor who bakes sourdough.", personality: "Playful and quick, warms up when asked about climbing.",
  direction: "When it fits, mention you froze on a route last week.", setting: "A bouldering gym café after a session",
  openingLine: "You made it! Did you find the café okay?", difficulty: "medium",
  voice: { gender: "female", age: "young", accent: "american", description: "warm, bright" },
  look: { model: "Casual2_Female", skin: "#c68e63", hair: "#151313" },
  provenance: { name: "notes", age: "generated", gender: "notes", appearance: "generated", personality: "notes", interests: "notes", voice: "generated", setting: "generated" },
};

beforeEach(() => parse.mockReset());

describe("generated characters", () => {
  it("sends the notes as data with the user's explicit choices, and enables refusal fallbacks", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", model: "test-model", parsed_output: spec });
    const result = await generateCharacter({ notes: "Loves climbing and baking, very teasing.", gender: "woman", difficulty: "hard" });
    const request = parse.mock.calls[0]![0];
    expect(request).toMatchObject({ fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(request.system).toMatch(/never a name from the notes/i);
    expect(JSON.parse(request.messages[0].content)).toEqual({
      notes: "Loves climbing and baking, very teasing.",
      choices: { gender: "woman", age: null, background: null, voice: null, difficulty: "hard", setting: null },
      profile: null,
      existing: [],
    });
    expect(result.spec.difficulty).toBe("hard");
    expect(result.provenance.name).toBe("generated");
    expect(result.model).toBe("test-model");
  });

  it("invents someone new from the profile when the notes are empty, distinct from existing characters", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", model: "test-model", parsed_output: spec });
    const existing = [{ name: "Maya", setting: "Sunday afternoon coffee shop", bio: "UX designer." }];
    await generateCharacter({ notes: "", difficulty: "easy", profile: { practicesWith: "women", experience: "beginner" }, existing });
    const request = parse.mock.calls[0]![0];
    expect(request.system).toMatch(/notes are empty, invent someone new/i);
    expect(request.system).toMatch(/Never repeat a character from "existing"/);
    expect(JSON.parse(request.messages[0].content)).toMatchObject({
      notes: "", profile: { practicesWith: "women", experience: "beginner" }, existing,
    });
  });

  it("rejects a refused or truncated response instead of saving it", async () => {
    parse.mockResolvedValue({ stop_reason: "refusal", parsed_output: null });
    await expect(generateCharacter({ notes: "Someone I met at a party." })).rejects.toThrow(/declined/);
    parse.mockResolvedValue({ stop_reason: "max_tokens", parsed_output: spec });
    await expect(generateCharacter({ notes: "Someone I met at a party." })).rejects.toThrow(/could not be generated/);
  });

  it("lets the form's choices win and records them as the user's", () => {
    const chosen = applyChoices({ ...spec, gender: "man", age: 45 }, { notes: "x".repeat(20), gender: "woman", age: 30, voice: "low and calm", setting: "a jazz bar", background: "Korean American" });
    expect(chosen).toMatchObject({ gender: "woman", age: 30 });
    expect(chosen.provenance).toMatchObject({ gender: "notes", age: "notes", voice: "notes", setting: "notes", appearance: "notes", name: "generated" });
  });

  it("gives the voice the character's gender and age, even when the form overrode the model's", () => {
    const chosen = applyChoices({ ...spec, gender: "man", age: 62, voice: { ...spec.voice, gender: "male", age: "old" } },
      { notes: "x".repeat(20), gender: "woman", age: 30 });
    expect(chosen.voice).toMatchObject({ gender: "female", age: "young" });
    expect(applyChoices({ ...spec, age: 45 }, { notes: "" }).voice.age).toBe("middle_aged");
    expect(applyChoices({ ...spec, gender: "nonbinary", age: 60 }, { notes: "" }).voice).toMatchObject({ gender: "neutral", age: "old" });
  });

  it("keeps the plaza model consistent with the character's gender", () => {
    expect(plazaModelFor({ gender: "man", look: { ...spec.look, model: "Casual2_Female" } })).toBe("Casual2_Male");
    expect(plazaModelFor({ gender: "woman", look: spec.look })).toBe("Casual2_Female");
    expect(plazaModelFor({ gender: "nonbinary", look: { ...spec.look, model: "Suit_Male" } })).toBe("Suit_Male");
  });
});

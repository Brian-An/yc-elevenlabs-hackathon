import { describe, expect, it } from "vitest";
import type { PersonaWithScenario } from "./dto";
import { buildSessionVariables } from "./sessionVariables";
import { PERSONAS } from "./stockPersonas";

const variables = (persona: PersonaWithScenario) =>
  buildSessionVariables({ persona, direction: null }, persona.defaultScenario, null, null, null);

describe("buildSessionVariables", () => {
  it("tells every stock persona, coach included, its name, age, gender, pronouns and looks", () => {
    const pronouns = { woman: "she/her", man: "he/him", nonbinary: "they/them" };
    for (const persona of PERSONAS) {
      const direction = variables(persona).character_direction;
      expect(direction).toContain(`You are ${persona.name}, a ${persona.age}-year-old ${persona.gender} (${pronouns[persona.gender]}).`);
      expect(direction).toContain(persona.appearance);
    }
  });

  it("describes a generated character from its own gender and appearance", () => {
    const stock = PERSONAS[0]!;
    const generated: PersonaWithScenario = {
      ...stock, id: "custom-1", name: "Junho", age: 29,
      custom: {
        gender: "man", look: { model: "Casual2_Male", skin: "#e0b894", hair: "#1a1a1a" }, appearance: "Short black hair, cream knit sweater.",
        voiceName: null, avatarPreviewUrl: null, provenance: {} as never, createdAt: new Date(), deleted: false,
      },
    };
    const direction = variables(generated).character_direction;
    expect(direction).toContain("You are Junho, a 29-year-old man (he/him).");
    expect(direction).toContain("Short black hair, cream knit sweater.");
  });
});

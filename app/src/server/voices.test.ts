import { describe, expect, it } from "vitest";
import { rankVoices, type Voice } from "./voices";

const voice = (voiceId: string, gender: string | null, accent: string | null, age: string | null, description = ""): Voice =>
  ({ voiceId, name: voiceId, gender, accent, age, description });

describe("voice matching", () => {
  const voices = [
    voice("british-man", "male", "british", "middle_aged", "deep calm narrator"),
    voice("indian-woman", "female", "indian", "young", "warm bright conversational"),
    voice("american-woman", "female", "american", "young", "warm friendly"),
    voice("unlabelled", null, null, null),
  ];

  it("keeps the requested gender and prefers accent, then age, then tone", () => {
    const ranked = rankVoices(voices, { gender: "female", age: "young", accent: "indian", description: "warm and bright" });
    expect(ranked.map((v) => v.voiceId)).toEqual(["indian-woman", "american-woman", "unlabelled"]);
  });

  it("spreads characters across voices that fit nearly as well, but never at the cost of the accent", () => {
    const target = { gender: "female", age: "young", accent: "american", description: "warm" } as const;
    const similar = [...voices, voice("american-woman-2", "female", "american", "young", "calm")];
    expect(rankVoices(similar, target)[0]!.voiceId).toBe("american-woman");
    expect(rankVoices(similar, target, new Set(["american-woman"]))[0]!.voiceId).toBe("american-woman-2");
    expect(rankVoices(voices, target, new Set(["american-woman"]))[0]!.voiceId).toBe("american-woman");
  });

  it("accepts any voice for a neutral target", () => {
    expect(rankVoices(voices, { gender: "neutral", age: "middle_aged", accent: "british", description: "calm" })[0]!.voiceId).toBe("british-man");
  });
});

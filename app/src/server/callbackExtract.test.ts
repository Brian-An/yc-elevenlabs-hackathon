import { describe, expect, it } from "vitest";
import { extractCallback } from "./callbackExtract";
import type { Transcript } from "../shared/types";

const t = (...lines: [("user" | "agent"), string][]): Transcript =>
  lines.map(([speaker, text], i) => ({ speaker, text, timestamp: i * 1000 }));

describe("extractCallback", () => {
  it("picks up a plan the user shared", () => {
    expect(
      extractCallback(t(["agent", "What are you up to this weekend?"], ["user", "Honestly not much. I'm taking a pottery class on Saturday, my first one."])),
    ).toBe("I'm taking a pottery class on Saturday, my first one.");
  });

  it("prefers the most recent detail", () => {
    expect(
      extractCallback(t(["user", "I just started a new job."], ["agent", "Nice!"], ["user", "And my sister's wedding is next month."])),
    ).toBe("And my sister's wedding is next month.");
  });

  it("ignores what the persona said", () => {
    expect(extractCallback(t(["agent", "I'm taking a pottery class on Saturday."], ["user", "Oh cool, that sounds fun."]))).toBeNull();
  });

  it("ignores questions and small talk", () => {
    expect(extractCallback(t(["user", "Are you going to the market tomorrow?"], ["user", "Yeah, coffee is good here."]))).toBeNull();
  });
});

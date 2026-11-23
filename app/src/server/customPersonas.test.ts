import { describe, expect, it, vi } from "vitest";

vi.mock("wasp/server", () => ({
  prisma: {},
  HttpError: class HttpError extends Error {
    constructor(readonly statusCode: number, message?: string) { super(message); }
  },
}));
vi.mock("./avatarCatalog", () => ({ matchAvatar: vi.fn() }));
const { characterRequest } = await import("./customPersonas");

describe("character form", () => {
  it("trims the notes and drops empty optional fields", () => {
    expect(characterRequest({ notes: "  Loves hiking and old films.  ", gender: "woman", age: 29, background: "", setting: " " }))
      .toEqual({ notes: "Loves hiking and old films.", gender: "woman", age: 29, background: undefined, voice: undefined, difficulty: undefined, setting: undefined });
  });

  it("accepts empty notes, which ask for someone new, and a few words as a seed", () => {
    expect(characterRequest({}).notes).toBe("");
    expect(characterRequest({ notes: "   " }).notes).toBe("");
    expect(characterRequest({ notes: "shy barista" }).notes).toBe("shy barista");
  });

  it.each([
    [{ notes: "hi" }, /few more words/],
    [{ notes: "x".repeat(2001) }, /2,000/],
    [{ notes: "Loves hiking a lot.", age: 17 }, /between 21 and 70/],
    [{ notes: "Loves hiking a lot.", gender: "robot" }, /Gender/],
    [{ notes: "Loves hiking a lot.", difficulty: "extreme" }, /Difficulty/],
    [{ notes: "Loves hiking a lot.", setting: "x".repeat(161) }, /Setting/],
  ])("rejects invalid input (%#)", (args, message) => {
    expect(() => characterRequest(args as never)).toThrow(message);
  });
});

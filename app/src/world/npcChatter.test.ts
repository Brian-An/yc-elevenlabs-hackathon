import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXTRAS } from "./layout";
import { NPC_LINES, npcLineUrl } from "./npcLines";

/** A stand-in for the browser's Audio: records what played and lets a test end the clip. */
class FakeAudio extends EventTarget {
  static played: string[] = [];
  volume = 1;
  paused = true;
  constructor(public src: string) { super(); }
  play() {
    this.paused = false;
    FakeAudio.played.push(this.src);
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  end() {
    this.paused = true;
    this.dispatchEvent(new Event("ended"));
  }
}

// The chatter keeps plaza-wide state at module level, so each test loads a fresh copy.
async function load() {
  vi.resetModules();
  return import("./npcChatter");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["performance", "setTimeout"] });
  vi.stubGlobal("Audio", FakeAudio);
  vi.stubGlobal("window", globalThis);
  FakeAudio.played = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NPC lines", () => {
  it("has lines for every passer-by", () => {
    expect(NPC_LINES).toHaveLength(EXTRAS.length);
    for (const entry of NPC_LINES) expect(entry.lines.length).toBeGreaterThan(0);
  });

  it("has a generated clip for every line", () => {
    const publicDir = fileURLToPath(new URL("../../public", import.meta.url));
    const missing = NPC_LINES.flatMap((entry, extra) => entry.lines.map((_, line) => npcLineUrl(extra, line)))
      .filter((url) => !existsSync(publicDir + url));
    expect(missing).toEqual([]);
  });
});

describe("trySpeak", () => {
  it("captions the line, plays its clip, and clears the caption when the clip ends", async () => {
    const { subscribeCaption, trySpeak } = await load();
    const caption = vi.fn();
    subscribeCaption(caption);
    const audio = trySpeak(0) as unknown as FakeAudio;
    expect(caption).toHaveBeenLastCalledWith(NPC_LINES[0]!.lines[0]);
    expect(FakeAudio.played).toEqual([npcLineUrl(0, 0)]);
    audio.end();
    expect(caption).toHaveBeenLastCalledWith(null);
  });

  it("lets only one passer-by talk at a time, with a pause between lines", async () => {
    const { trySpeak } = await load();
    const first = trySpeak(0) as unknown as FakeAudio;
    expect(trySpeak(1)).toBeNull();
    first.end();
    expect(trySpeak(1)).toBeNull();
    vi.advanceTimersByTime(6_000);
    expect(trySpeak(1)).not.toBeNull();
  });

  it("makes each passer-by wait before speaking again, then moves on to their next line", async () => {
    const { subscribeCaption, trySpeak } = await load();
    (trySpeak(2) as unknown as FakeAudio).end();
    vi.advanceTimersByTime(10_000);
    expect(trySpeak(2)).toBeNull();
    vi.advanceTimersByTime(25_000);
    const caption = vi.fn();
    subscribeCaption(caption);
    expect(trySpeak(2)).not.toBeNull();
    const lines = NPC_LINES[2]!.lines;
    expect(caption).toHaveBeenLastCalledWith(lines[(2 % lines.length + 1) % lines.length]);
  });
});

// Picks an ElevenLabs voice for a generated character from the voices in the account.
// https://elevenlabs.io/docs/api-reference/voices/search
import { z } from "zod";

const VOICES_API = "https://api.elevenlabs.io/v2/voices";
const CACHE_MS = 10 * 60_000;

/** What the character should sound like. Labels follow ElevenLabs' voice labels. */
export type VoiceTarget = {
  gender: "female" | "male" | "neutral";
  age: "young" | "middle_aged" | "old";
  /** e.g. "american", "british", "indian", "australian" */
  accent: string;
  /** A few words, e.g. "warm, bright, conversational" */
  description: string;
};

export type Voice = { voiceId: string; name: string; gender: string | null; age: string | null; accent: string | null; description: string };

const voiceSchema = z.object({
  voice_id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  labels: z.record(z.string(), z.string()).nullish(),
});
const pageSchema = z.object({ voices: z.array(voiceSchema), has_more: z.boolean().optional(), next_page_token: z.string().nullish() });

let cache: { at: number; voices: Voice[] } | null = null;

/** The account's voices, cached briefly. Empty when ElevenLabs is not configured or unreachable. */
export async function accountVoices(): Promise<Voice[]> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return [];
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.voices;
  const voices: Voice[] = [];
  let token: string | null | undefined;
  try {
    for (let page = 0; page < 5; page++) {
      const url = new URL(VOICES_API);
      url.searchParams.set("page_size", "100");
      if (token) url.searchParams.set("next_page_token", token);
      const response = await fetch(url, { headers: { "xi-api-key": apiKey }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`ElevenLabs voices returned ${response.status}`);
      const body = pageSchema.parse(await response.json());
      for (const voice of body.voices) {
        const labels = voice.labels ?? {};
        voices.push({
          voiceId: voice.voice_id, name: voice.name,
          gender: labels.gender?.toLowerCase() ?? null, age: labels.age?.toLowerCase().replace(/[\s-]+/g, "_") ?? null,
          accent: labels.accent?.toLowerCase() ?? null,
          description: [voice.description, labels.description, labels.descriptive, labels.use_case].filter(Boolean).join(" ").toLowerCase(),
        });
      }
      token = body.next_page_token;
      if (!body.has_more || !token) break;
    }
  } catch (error) {
    console.error("[voices] listing failed:", error instanceof Error ? error.message : "unknown");
    return cache?.voices ?? [];
  }
  cache = { at: Date.now(), voices };
  return voices;
}

const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 3));

/**
 * Scores each voice against the target. Gender must match when both sides state one; accent counts most,
 * then age, then shared descriptive words. Voices other characters already use rank lower, for variety.
 */
export function rankVoices(voices: Voice[], target: VoiceTarget, avoid: ReadonlySet<string> = new Set()): Voice[] {
  const wanted = words(target.description);
  const accent = target.accent.toLowerCase();
  const scored = voices.flatMap((voice) => {
    if (target.gender !== "neutral" && voice.gender && voice.gender !== target.gender) return [];
    let score = 0;
    if (voice.gender === target.gender) score += 2;
    if (voice.accent && (voice.accent.includes(accent) || accent.includes(voice.accent))) score += 4;
    if (voice.age === target.age) score += 2;
    for (const word of words(voice.description)) if (wanted.has(word)) score += 1;
    if (avoid.has(voice.voiceId)) score -= 3;
    return [{ voice, score }];
  });
  return scored.sort((a, b) => b.score - a.score || a.voice.name.localeCompare(b.voice.name)).map(({ voice }) => voice);
}

export async function pickVoice(target: VoiceTarget, avoid: ReadonlySet<string>): Promise<Voice | null> {
  return rankVoices(await accountVoices(), target, avoid)[0] ?? null;
}

// Finds one detail the user explicitly shared on a date that the persona could follow up on
// next time ("How did that pottery class go?"). Rule-based for now: it looks for plans, new
// activities and upcoming events in the user's own words. Swap the body for an LLM call later,
// keeping the signature. Returns null when there's nothing worth following up on.
import type { Transcript } from "../shared/types";

const DAY = "(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
const WHEN = `(?:tomorrow|tonight|this (?:week|weekend|month|${DAY})|next (?:week|weekend|month|year|${DAY})|on ${DAY}|in (?:a|two|three|\\d+) (?:days|weeks|months))`;

const PATTERNS: RegExp[] = [
  // "I'm taking a pottery class", "I'm starting a new job", "I'm running a half marathon"
  /\bI(?:'m| am) (?:going to|gonna|about to|taking|starting|doing|trying|learning|training for|running|moving|visiting|flying|heading|interviewing|signing up|planning)\b/i,
  // "I signed up for...", "I just booked...", "I just started..."
  /\bI (?:just |finally |recently )?(?:signed up|booked|started|applied|enrolled|registered|joined|adopted|bought tickets)\b/i,
  // "I've got / I have a [thing] [when]"
  new RegExp(`\\bI(?:'ve| have)(?: got)? (?:a|an|my|this|our)\\b.*\\b${WHEN}\\b`, "i"),
  // "My sister's wedding is next month", "my exam is on Friday"
  new RegExp(`\\bmy \\w+(?:'s \\w+)? (?:is|are|starts|begins)\\b.*\\b${WHEN}\\b`, "i"),
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function extractCallback(transcript: Transcript): string | null {
  const userSentences = transcript.filter((t) => t.speaker === "user").flatMap((t) => sentences(t.text));
  // Latest first: the most recent thing they mentioned is the most natural to follow up on.
  for (const sentence of [...userSentences].reverse()) {
    const words = sentence.split(/\s+/).length;
    if (words < 4 || words > 40) continue;
    if (sentence.includes("?")) continue; // questions to the persona aren't things the user shared
    if (PATTERNS.some((p) => p.test(sentence))) return sentence;
  }
  return null;
}

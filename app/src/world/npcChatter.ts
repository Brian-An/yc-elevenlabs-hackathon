import { NPC_LINES, npcLineUrl } from "./npcLines";

/** How close the player has to walk for a passer-by to say something, in metres. */
export const CHATTER_RADIUS = 2.6;
/** Quiet time across the whole plaza after any line, so passers-by take turns instead of talking over each other. */
const PLAZA_GAP_MS = 6_000;
/** How long one passer-by waits before speaking again. */
const PERSON_GAP_MS = 30_000;
/** How long the caption stays if the clip can't play, e.g. before the page has had a click or key press. */
const CAPTION_FALLBACK_MS = 3_500;
const VOLUME = 0.6;
/** Longest a line may hold the plaza, in case a clip stalls without ending or failing. */
const MAX_LINE_MS = 12_000;

let lastLineAt = -Infinity;
let caption: string | null = null;
const listeners = new Set<(text: string | null) => void>();
const setCaption = (text: string | null) => {
  caption = text;
  for (const listener of listeners) listener(text);
};

/** Follows the line being spoken right now (null when nobody is talking), for the on-screen caption. */
export function subscribeCaption(listener: (text: string | null) => void): () => void {
  listeners.add(listener);
  listener(caption);
  return () => {
    listeners.delete(listener);
  };
}

let speaking = false;
const lastByPerson = new Map<number, number>();
const nextLine = new Map<number, number>();

/**
 * Says the next line for a passer-by if the plaza is quiet and they haven't spoken lately, captioning it until the
 * clip ends. Returns the clip's audio element, or null when they stay quiet.
 */
export function trySpeak(extra: number): HTMLAudioElement | null {
  const entry = NPC_LINES[extra];
  const now = performance.now();
  if (!entry || speaking || now - lastLineAt < PLAZA_GAP_MS || now - (lastByPerson.get(extra) ?? -Infinity) < PERSON_GAP_MS) return null;

  // Each passer-by starts on a different line and works through theirs in order, so repeats are rare.
  const line = nextLine.get(extra) ?? extra % entry.lines.length;
  nextLine.set(extra, (line + 1) % entry.lines.length);
  speaking = true;
  lastLineAt = now;
  lastByPerson.set(extra, now);

  const audio = new Audio(npcLineUrl(extra, line));
  audio.volume = VOLUME;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    speaking = false;
    lastLineAt = performance.now();
    setCaption(null);
  };
  audio.addEventListener("ended", finish);
  audio.addEventListener("error", () => window.setTimeout(finish, CAPTION_FALLBACK_MS));
  setCaption(entry.lines[line]!);
  window.setTimeout(finish, MAX_LINE_MS);
  // Browsers block sound until the page has had a click or key press; the caption still shows.
  audio.play().catch(() => window.setTimeout(finish, CAPTION_FALLBACK_MS));
  return audio;
}

/** Stops a line early, e.g. when the passer-by leaves the scene or a date starts. */
export function stopSpeaking(audio: HTMLAudioElement | null) {
  if (!audio || audio.paused) return;
  audio.pause();
  audio.dispatchEvent(new Event("ended"));
}

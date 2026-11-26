/**
 * Typed mock data for the UI while the backend operations are being built.
 *
 * Each page reads through one `getMock*` function below. To wire real data, replace that one line in the page, e.g.
 *   const feedback = getMockFeedback(sessionId);
 * becomes
 *   const { data: feedback } = useQuery(getFeedback, { sessionId });
 * The view types here describe what each page needs, so the real operations can return the same shape.
 */
import type { Difficulty, Evaluation, MoveEvaluation, Persona, Scenario, SkillName, Transcript } from "../shared/types";

// ---------- View types (UI-side shapes built on the shared contracts) ----------

export type SkillScores = Record<SkillName, number>;

export type UserProfile = {
  name: string;
  goals: string[];
  experience: ExperienceLevel;
  lookingFor: string;
  focus: string;
};

export type ExperienceLevel = "beginner" | "intermediate" | "experienced"; // matches User.experienceLevel

/** What memory remembers about the user. */
export type Memory = {
  strengths: string[];
  weaknesses: string[];
};

export type SessionStatus = "scheduled" | "in_progress" | "completed";

export type SessionSummary = {
  id: string;
  persona: Persona;
  scenario: Scenario;
  status: SessionStatus;
  startedAt: string; // ISO
  durationSec?: number;
  scores?: SkillScores;
};

export type DateSessionData = {
  id: string;
  persona: Persona;
  scenario: Scenario;
  /** A transcript to preview the UI with. The real one streams in from ElevenLabs. */
  sampleTranscript: Transcript;
};

export type FeedbackData = {
  session: SessionSummary;
  evaluation: Evaluation;
  transcript: Transcript;
  /** Jev's grade per user turn (DateSessionDTO.moves). */
  moves: MoveEvaluation[];
  previousScores?: SkillScores;
  nextScenario: Scenario;
};

// ---------- Static copy ----------

export const SKILLS: { key: SkillName; label: string; hint: string }[] = [
  { key: "listening", label: "Listening", hint: "Picking up on what they said and building on it" },
  { key: "engagement", label: "Engagement", hint: "Curiosity, follow-up questions, warmth" },
  { key: "confidence", label: "Confidence", hint: "Sharing about yourself without hedging" },
  { key: "flow", label: "Flow", hint: "Smooth turns, no interview mode, comfortable pauses" },
];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

// ---------- Mock records ----------

export const personas: Persona[] = [
  {
    id: "maya",
    name: "Maya",
    age: 28,
    bio: "Pastry chef who just got back from a month in Lisbon. Talks with her hands.",
    personality: "Warm, curious, asks a lot back",
  },
  {
    id: "theo",
    name: "Theo",
    age: 31,
    bio: "Architect, dry humor, reads more than he admits. Slow to open up.",
    personality: "Reserved, witty, rewards real questions",
  },
  {
    id: "priya",
    name: "Elena",
    age: 26,
    bio: "Startup founder running on cold brew. Changes topic fast and expects you to keep up.",
    personality: "High energy, distracted, a little blunt",
  },
];

export const scenarios: Scenario[] = [
  { id: "sc-coffee", personaId: "maya", setting: "Coffee shop, first date", difficulty: "easy", openingLine: "Okay, I have to ask: is that a cortado? Bold choice." },
  { id: "sc-gallery", personaId: "theo", setting: "Gallery opening, second date", difficulty: "medium", openingLine: "So. Do you actually like this one, or are we being polite?" },
  { id: "sc-bar", personaId: "priya", setting: "Loud bar after work", difficulty: "hard", openingLine: "Sorry, sorry, my phone keeps going. Where were we?" },
];

const recommended: Scenario = {
  id: "sc-followup-listening",
  personaId: "theo",
  setting: "Quiet wine bar, Theo shares something personal",
  difficulty: "medium",
  targetWeakness: "listening",
  openingLine: "I nearly didn't come tonight. Long week. My dad's been in the hospital.",
};

export const coachingDemo: Transcript = [
  { speaker: "user", text: "I get quiet when someone tells me something personal.", timestamp: 3500 },
  { speaker: "agent", text: "Let's try it. Imagine I said, “I made a gift for my sister and it broke.” What would you say?", timestamp: 7000 },
  { speaker: "user", text: "Oh, that sounds disappointing. What was the occasion?", timestamp: 14000 },
  { speaker: "agent", text: "You acknowledged the disappointment and gave me room to tell you about my sister.", timestamp: 18000 },
];

export const sampleTranscript: Transcript = [
  { speaker: "agent", text: "Okay, I have to ask: is that a cortado? Bold choice.", timestamp: 0 },
  { speaker: "user", text: "Ha, yeah. I'm trying to be the kind of person who orders a cortado.", timestamp: 4200 },
  { speaker: "agent", text: "I respect that. I just got back from Lisbon, so I'm a coffee snob now. Sorry in advance.", timestamp: 9800 },
  { speaker: "user", text: "Nice. So what do you do for work?", timestamp: 15100 },
  { speaker: "agent", text: "I'm a pastry chef. Mostly laminated dough, lots of 4am starts.", timestamp: 19400 },
  { speaker: "user", text: "Wait, 4am? Is that the part you love or the part you put up with?", timestamp: 25600 },
  { speaker: "agent", text: "Honestly? I love it. The city's quiet, it's just me and the butter.", timestamp: 31200 },
  { speaker: "user", text: "That sounds peaceful. I'm taking a pottery class on Saturday, my first one, so I'm about to find out how bad my hands are.", timestamp: 37800 },
  { speaker: "agent", text: "Oh, you have to tell me how it goes. Pottery is so humbling.", timestamp: 44600 },
];

const sampleMoves: MoveEvaluation[] = [
  { turnIndex: 1, classification: "good", confidence: 0.71, scores: { listening: 6.4, engagement: 6.8, confidence: 7.5, flow: 7.2 } },
  { turnIndex: 3, classification: "inaccuracy", confidence: 0.64, scores: { listening: 2.8, engagement: 5.1, confidence: 5.6, flow: 4.4 } },
  { turnIndex: 5, classification: "great", confidence: 0.82, scores: { listening: 9.1, engagement: 9.0, confidence: 6.9, flow: 8.3 } },
];

/** The demo date with Maya. Live dates with Maya reuse its feedback (see fixedDateReview on the server). */
export const demoEvaluation: Evaluation = {
  scores: { listening: 5, engagement: 7, confidence: 6, flow: 6 },
  strengths: [
    {
      point: "Good follow-up question that showed real curiosity about her work.",
      quote: "Wait, 4am? Is that the part you love or the part you put up with?",
    },
    {
      point: "Light self-deprecating humor that made the opener easy.",
      quote: "I'm trying to be the kind of person who orders a cortado.",
    },
  ],
  weaknesses: [
    {
      point: "Skipped past Lisbon, the thing she was clearly excited about, and jumped to a stock question.",
      quote: "Nice. So what do you do for work?",
    },
    {
      point: "Shared very little about yourself, so it started to feel like an interview.",
      quote: "Nice. So what do you do for work?",
    },
  ],
  summary:
    "A friendly start with genuine curiosity once you got going. The main miss was listening for openings: she offered Lisbon twice and you moved on. Next time, follow the thread they hand you before switching topics, and trade a detail about yourself for each question you ask.",
};

const sessions: SessionSummary[] = [
  {
    id: "s-103",
    persona: personas[0]!,
    scenario: scenarios[0]!,
    status: "completed",
    startedAt: "2026-11-22T10:12:00Z",
    durationSec: 412,
    scores: demoEvaluation.scores,
  },
  {
    id: "s-102",
    persona: personas[2]!,
    scenario: scenarios[2]!,
    status: "completed",
    startedAt: "2026-11-21T19:40:00Z",
    durationSec: 288,
    scores: { listening: 4, engagement: 6, confidence: 4, flow: 5 },
  },
  {
    id: "s-101",
    persona: personas[1]!,
    scenario: scenarios[1]!,
    status: "completed",
    startedAt: "2026-11-20T18:05:00Z",
    durationSec: 365,
    scores: { listening: 5, engagement: 5, confidence: 5, flow: 4 },
  },
];

// ---------- Accessors (swap these for real queries) ----------

export function getMockDateSession(sessionId: string): DateSessionData {
  const session = sessions.find((s) => s.id === sessionId);
  return {
    id: sessionId,
    persona: session?.persona ?? personas[0]!,
    scenario: session?.scenario ?? scenarios[0]!,
    sampleTranscript,
  };
}

export function getMockFeedback(sessionId: string): FeedbackData {
  const session = sessions.find((s) => s.id === sessionId) ?? sessions[0]!;
  return {
    session: { ...session, id: sessionId },
    evaluation: demoEvaluation,
    transcript: sampleTranscript,
    moves: sampleMoves,
    previousScores: sessions[1]!.scores,
    nextScenario: recommended,
  };
}

export function personaFor(scenario: Scenario): Persona {
  return personas.find((p) => p.id === scenario.personaId) ?? personas[0]!;
}

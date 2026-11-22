// Shared contracts between the client, the server and the evaluator.
// Change these only by agreement: every part of the loop depends on them.

export type Speaker = "user" | "agent";

export type TranscriptTurn = {
  speaker: Speaker;
  text: string;
  timestamp: number; // ms since the date started
};

export type Transcript = TranscriptTurn[];

export type SkillName = "listening" | "engagement" | "confidence" | "flow";

export type EvidencedPoint = {
  point: string;
  quote: string; // a line from the transcript that backs it up
};

export type Evaluation = {
  scores: Record<SkillName, number>; // 1–10
  strengths: EvidencedPoint[];
  weaknesses: EvidencedPoint[];
  summary: string;
};

export type Difficulty = "easy" | "medium" | "hard";

export type Persona = {
  id: string;
  name: string;
  age: number;
  bio: string;
  personality: string;
  elevenLabsAgentId?: string;
};

export type Scenario = {
  id: string;
  personaId: string;
  setting: string; // e.g. "coffee shop, first date"
  difficulty: Difficulty;
  targetWeakness?: SkillName;
  openingLine?: string;
};

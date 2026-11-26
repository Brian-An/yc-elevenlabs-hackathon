// Shared contracts between the client, the server and the evaluator.
// Change these only by agreement: every part of the loop depends on them.

export type Speaker = "user" | "agent";

export type TranscriptTurn = {
  speaker: Speaker;
  text: string;
  timestamp: number; // ms since the date started
  sequence?: number; // stable position within this call
  revision?: number; // increases when a provider corrects this utterance
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
  /** Portrait: the preview of the video avatar this persona appears as, so the photo matches the call. */
  photoUrl?: string;
  /** Set on characters a user generated. Stock personas take their look from src/world/layout.ts. */
  custom?: CustomPersonaDetails;
};

/** Plaza model (a file in public/models/characters) and colour overrides. */
export type PersonaLook = { model: string; skin: string; hair: string };

/** Where each generated trait came from: the user's notes, or the model's own choice. */
export type TraitSource = "notes" | "generated";
export type PersonaProvenance = Record<"name" | "age" | "gender" | "appearance" | "personality" | "interests" | "voice" | "setting", TraitSource>;

export type CustomPersonaDetails = {
  gender: "woman" | "man" | "nonbinary";
  look: PersonaLook;
  appearance: string;
  voiceName: string | null;
  /** Preview image of the matched video avatar, when one was matched. */
  avatarPreviewUrl: string | null;
  provenance: PersonaProvenance;
  createdAt: Date;
  deleted: boolean;
};

/** Longest a date's setting can be, so it fits on one line in cards and badges. */
export const SETTING_MAX_LENGTH = 60;
/** Longest a generated character's bio can be: one sentence, so the plaza card stays small. */
export const BIO_MAX_LENGTH = 120;

export type Scenario = {
  id: string;
  personaId: string;
  setting: string; // e.g. "coffee shop, first date"
  difficulty: Difficulty;
  targetWeakness?: SkillName;
  openingLine?: string;
};

// Per-turn grade of a user reply, like a chess move classification.
// Best first; "neutral" is a fine reply that neither helps nor hurts.
export type MoveClass = "great" | "good" | "neutral" | "inaccuracy" | "mistake" | "blunder";

export type MoveEvaluation = {
  turnIndex: number; // index of the user turn in the transcript
  classification: MoveClass;
  decision?: { rawLabel: MoveClass; probabilities: Record<MoveClass, number> };
  confidence: number; // 0–1, Jev's probability for the classification
  scores: Record<SkillName, number>; // 1–10, same scale as Evaluation.scores
};

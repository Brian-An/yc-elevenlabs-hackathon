// Shapes the server returns to the client. Import with `import type` from the
// client so no server code is bundled. Contract types live in src/shared/types.ts.
import type {
  Difficulty,
  Evaluation,
  EvidencedPoint,
  Persona,
  Scenario,
  SkillName,
  Transcript,
  TranscriptTurn,
} from "../shared/types";

export type SessionStatus = "active" | "ended" | "evaluated";
// JSON-safe preference values (operations payloads must be superjson-serializable).
export type PreferenceValue = string | number | boolean | null | string[];
export type Preferences = {
  personality?: string[]; // e.g. ["outgoing", "funny"]
  dateSetting?: string; // e.g. "coffee"
  [key: string]: PreferenceValue | undefined;
};

/** Per-skill level from 0 to 1, averaged over the last 3 evaluated dates. */
export type SkillProfile = Record<SkillName, number>;

export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

export type MemoryPoint = EvidencedPoint & {
  skill?: SkillName;
  sessionId: string;
  at: string; // ISO date
};

export type SkillHistoryEntry = {
  sessionId: string;
  personaId: string;
  at: string; // ISO date
  scores: Record<SkillName, number>;
};

export type MemorySnapshot = {
  skillProfile: SkillProfile | null; // null until the first evaluated date
  trainingFocus: SkillName | null; // the skill the next date targets
  strengths: MemoryPoint[]; // newest first, capped
  weaknesses: MemoryPoint[]; // newest first, capped
  skillHistory: SkillHistoryEntry[]; // oldest first
  sessionsCount: number;
};

export type Profile = {
  id: number;
  username: string | null;
  displayName: string | null;
  goals: string | null;
  experienceLevel: string | null;
  preferences: Preferences;
  onboardedAt: Date | null;
  memory: MemorySnapshot;
};

export type PersonaWithScenario = Persona & {
  difficulty: Difficulty;
  defaultScenario: Scenario;
};

export type DateSessionDTO = {
  id: string;
  personaId: string;
  persona: Persona | null;
  scenario: Scenario;
  status: SessionStatus;
  transcript: Transcript;
  evaluation: Evaluation | null;
  startedAt: Date;
  endedAt: Date | null;
};

export type DateSessionSummary = Omit<DateSessionDTO, "transcript"> & {
  turnCount: number;
};

// Operation args
export type UpdateProfileArgs = {
  displayName?: string;
  goals?: string;
  experienceLevel?: string;
  preferences?: Preferences;
};
export type CreateDateSessionArgs = { personaId: string; scenario?: Scenario };
export type IdArgs = { id: string };
export type AppendTranscriptArgs = { id: string; turns: TranscriptTurn[] };
export type SaveTranscriptArgs = { id: string; transcript: Transcript };
export type EndDateSessionArgs = { id: string; transcript?: Transcript };
export type GetNextScenarioArgs = { personaId?: string } | void;
export type TranscriptResult = { id: string; turnCount: number };

// Shapes the server returns to the client. Import with `import type` from the
// client so no server code is bundled. Contract types live in src/shared/types.ts.
import type {
  Difficulty,
  Evaluation,
  EvidencedPoint,
  MoveEvaluation,
  Persona,
  Scenario,
  SkillName,
  Transcript,
  TranscriptTurn,
} from "../shared/types";
import type { DateReview, ReviewScores } from "../shared/dateReview";
import type { WithUser } from "./user";

export type SessionStatus = "active" | "ended" | "evaluated";
export type SessionKind = "date" | "coaching";
export type SessionSource = "live" | "demo" | "legacy";
export type ReviewStatus = "none" | "pending" | "processing" | "failed" | "ready" | "skipped" | "legacy";
export type ReviewFailure =
  | "not_configured" | "rate_limited" | "overloaded" | "provider_error" | "rejected"
  | "timeout" | "network" | "invalid_output" | "internal" | "interrupted";
/** Progress of the background review for an ended date. */
export type ReviewJobDTO = {
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  /** When a queued job is next eligible to run. null while running or finished. */
  nextAttemptAt: Date | null;
  /** Why the latest attempt failed, or "not_configured" while the review service is unavailable. */
  failureClass: ReviewFailure | null;
};
// JSON-safe preference values (operations payloads must be superjson-serializable).
export type PreferenceValue = string | number | boolean | null | string[];
export type Preferences = {
  personality?: string[]; // e.g. ["outgoing", "funny"]
  dateSetting?: string; // e.g. "coffee"
  [key: string]: PreferenceValue | undefined;
};

/** Per-skill level from 0 to 1, averaged over the last 3 evaluated dates. */
export type SkillProfile = Partial<Record<SkillName, number>>;

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
  scores: Partial<Record<SkillName, number>>;
  rubricVersion?: string;
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
  id: string;
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
  kind: SessionKind;
  source: SessionSource;
  reviewStatus: ReviewStatus;
  review: DateReview | null;
  reviewJob: ReviewJobDTO | null;
  transcript: Transcript;
  evaluation: Evaluation | null;
  /** Something the user told this persona last time, passed to the agent as {{user_context}}. */
  userContext: string | null;
  /** ElevenLabs agent for this persona (persona-specific or the default). null: the call is mocked. */
  agentId: string | null;
  /** Whether Anam video avatars are configured on this server (ANAM_* env vars set). */
  avatarEnabled: boolean;
  /** Jev's grade per user turn, in turn order. Fills in during the date as turns are appended. */
  moves: MoveEvaluation[];
  /** Whether the server grades replies (a TypeSafe key is set). */
  gradingEnabled: boolean;
  startedAt: Date;
  endedAt: Date | null;
};

/** A history row. It never carries the transcript or full review, so lists stay small. */
export type DateSessionSummary = Omit<DateSessionDTO, "transcript" | "moves" | "gradingEnabled" | "review" | "reviewJob"> & {
  turnCount: number;
  replyCount: number;
  reviewScores: ReviewScores | null;
};

// Operation args
export type UpdateProfileArgs = WithUser & {
  displayName?: string;
  goals?: string;
  experienceLevel?: string;
  preferences?: Preferences;
};
export type CreateDateSessionArgs = WithUser & { personaId: string; scenario?: Scenario; coachSourceSessionId?: string };
export type IdArgs = WithUser & { id: string };
export type AppendTranscriptArgs = WithUser & { id: string; turns: TranscriptTurn[] };
export type SaveTranscriptArgs = WithUser & { id: string; transcript: Transcript };
export type EndDateSessionArgs = WithUser & { id: string; transcript?: Transcript };
export type GetNextScenarioArgs = WithUser & { personaId?: string };
export type TranscriptResult = { id: string; turnCount: number };

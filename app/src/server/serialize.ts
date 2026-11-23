// Json column helpers (PostgreSQL) plus DB row -> DTO mapping.
import type { Prisma } from "@prisma/client";
import type { DateSession } from "wasp/entities";
import type { DateReview, ReviewScores } from "../shared/dateReview";
import type { Evaluation, MoveEvaluation, Persona, Scenario, Transcript } from "../shared/types";
import type { DateSessionDTO, DateSessionSummary, ReviewJobDTO, SessionStatus } from "./dto";
import { heyGenEnabled } from "./heygen";
import { jevEnabled } from "./jev";

/** Reads a Json column as T, falling back when it is null. */
export function readJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value == null ? fallback : (value as T);
}

/** Casts a typed value for writing into a Json column. */
export const asJson = <T>(value: T) => value as unknown as Prisma.InputJsonValue;

/** Transcript writes keep the denormalized counts that history lists read. */
export function transcriptColumns(transcript: Transcript) {
  return {
    transcript: asJson(transcript),
    turnCount: transcript.length,
    replyCount: transcript.filter((turn) => turn.speaker === "user").length,
  };
}

type SummaryRow = Omit<DateSession, "transcript" | "review">;

/** Every DateSession column except the two large ones, for history lists. */
export const summaryColumns = {
  id: true, userId: true, personaId: true, kind: true, source: true, scenario: true, status: true, evaluation: true,
  reviewStatus: true, turnCount: true, replyCount: true, reviewScores: true, coachSourceSessionId: true,
  userContext: true, startedAt: true, endedAt: true,
} as const satisfies Record<keyof SummaryRow, true>;

/** The persona comes from personaLookup, so generated characters resolve for their owner only. */
function sessionFields(row: SummaryRow, persona: Persona | undefined) {
  const scenario = readJson<Scenario>(row.scenario, {
    id: "unknown",
    personaId: row.personaId,
    setting: "first date",
    difficulty: "medium",
  });
  const agentId = row.source === "demo" ? null : persona?.elevenLabsAgentId ?? process.env.ELEVENLABS_AGENT_ID ?? null;
  return {
    id: row.id,
    kind: row.kind as DateSessionDTO["kind"],
    source: row.source as DateSessionDTO["source"],
    reviewStatus: row.reviewStatus as DateSessionDTO["reviewStatus"],
    personaId: row.personaId,
    persona: persona ?? null,
    scenario,
    status: row.status as SessionStatus,
    evaluation: readJson<Evaluation | null>(row.evaluation, null),
    userContext: row.userContext,
    agentId,
    avatarEnabled: heyGenEnabled(),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export function toSessionDTO(
  row: DateSession, persona: Persona | undefined, moves: MoveEvaluation[] = [], reviewJob: ReviewJobDTO | null = null,
): DateSessionDTO {
  return {
    ...sessionFields(row, persona),
    review: row.reviewStatus === "ready" ? readJson<DateReview | null>(row.review, null) : null,
    reviewJob,
    transcript: readJson<Transcript>(row.transcript, []),
    moves,
    gradingEnabled: row.kind === "date" && row.source !== "demo" && jevEnabled(),
  };
}

export function toSessionSummary(row: SummaryRow, persona: Persona | undefined): DateSessionSummary {
  return {
    ...sessionFields(row, persona),
    turnCount: row.turnCount,
    replyCount: row.replyCount,
    reviewScores: row.reviewStatus === "ready" ? readJson<ReviewScores | null>(row.reviewScores, null) : null,
  };
}

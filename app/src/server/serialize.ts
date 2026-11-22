// Json column helpers (PostgreSQL) plus DB row -> DTO mapping.
import type { Prisma } from "@prisma/client";
import type { DateSession } from "wasp/entities";
import type { Evaluation, MoveEvaluation, Scenario, Transcript } from "../shared/types";
import type { DateSessionDTO, DateSessionSummary, SessionStatus } from "./dto";
import { heyGenEnabled } from "./heygen";
import { jevEnabled } from "./jev";
import { getPersona } from "./personas";

/** Reads a Json column as T, falling back when it is null. */
export function readJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  return value == null ? fallback : (value as T);
}

/** Casts a typed value for writing into a Json column. */
export const asJson = <T>(value: T) => value as unknown as Prisma.InputJsonValue;

export function toSessionDTO(row: DateSession, moves: MoveEvaluation[] = []): DateSessionDTO {
  const scenario = readJson<Scenario>(row.scenario, {
    id: "unknown",
    personaId: row.personaId,
    setting: "first date",
    difficulty: "medium",
  });
  return {
    id: row.id,
    personaId: row.personaId,
    persona: getPersona(row.personaId) ?? null,
    scenario,
    status: row.status as SessionStatus,
    transcript: readJson<Transcript>(row.transcript, []),
    evaluation: readJson<Evaluation | null>(row.evaluation, null),
    userContext: row.userContext,
    agentId: getPersona(row.personaId)?.elevenLabsAgentId ?? process.env.ELEVENLABS_AGENT_ID ?? null,
    avatarEnabled: heyGenEnabled(),
    moves,
    gradingEnabled: jevEnabled(),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export function toSessionSummary(row: DateSession): DateSessionSummary {
  const { transcript, moves: _moves, gradingEnabled: _grading, ...rest } = toSessionDTO(row);
  return { ...rest, turnCount: transcript.length, replyCount: transcript.filter((turn) => turn.speaker === "user").length };
}

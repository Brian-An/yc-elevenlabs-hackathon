// JSON-in-String helpers for SQLite columns, plus DB row -> DTO mapping.
import type { DateSession } from "wasp/entities";
import type { Evaluation, Scenario, Transcript } from "../shared/types";
import type { DateSessionDTO, DateSessionSummary, SessionStatus } from "./dto";
import { getPersona } from "./personas";

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function toSessionDTO(row: DateSession): DateSessionDTO {
  const scenario = parseJson<Scenario>(row.scenario, {
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
    transcript: parseJson<Transcript>(row.transcript, []),
    evaluation: parseJson<Evaluation | null>(row.evaluation, null),
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export function toSessionSummary(row: DateSession): DateSessionSummary {
  const { transcript, ...rest } = toSessionDTO(row);
  return { ...rest, turnCount: transcript.length };
}

import type { DateSession } from "wasp/entities";
import { HttpError } from "wasp/server";
import type {
  AppendTranscript,
  CreateDateSession,
  EndDateSession,
  GetDateSession,
  GetNextScenario,
  GetPersonas,
  ListDateSessions,
  SaveTranscript,
} from "wasp/server/operations";
import type { Evaluation, Scenario, Transcript, TranscriptTurn } from "../shared/types";
import type {
  AppendTranscriptArgs,
  CreateDateSessionArgs,
  DateSessionDTO,
  DateSessionSummary,
  EndDateSessionArgs,
  GetNextScenarioArgs,
  IdArgs,
  PersonaWithScenario,
  SaveTranscriptArgs,
  TranscriptResult,
} from "./dto";
import { evaluateTranscript, generateNextScenario } from "./evaluator";
import { getMemory, saveMemory } from "./memory";
import { getPersona, listPersonas } from "./personas";
import { parseJson, toSessionDTO, toSessionSummary } from "./serialize";

type Ctx = { user?: { id: number } | null; entities: { DateSession: any } };

async function ownedSession(context: Ctx, id: unknown) {
  if (!context.user) throw new HttpError(401);
  if (typeof id !== "string" || !id) throw new HttpError(400, "id is required");
  const row = await context.entities.DateSession.findFirst({ where: { id, userId: context.user.id } });
  if (!row) throw new HttpError(404, "Date session not found");
  return row as DateSession;
}

function cleanTurns(turns: unknown): TranscriptTurn[] {
  if (!Array.isArray(turns)) throw new HttpError(400, "turns must be an array");
  return turns
    .filter((t) => t && (t.speaker === "user" || t.speaker === "agent") && typeof t.text === "string")
    .map((t) => ({ speaker: t.speaker, text: t.text, timestamp: Number(t.timestamp) || 0 }));
}

export const getPersonas: GetPersonas<void, PersonaWithScenario[]> = async () => listPersonas();

export const createDateSession: CreateDateSession<CreateDateSessionArgs, DateSessionDTO> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const persona = getPersona(args?.personaId);
  if (!persona) throw new HttpError(400, `Unknown personaId: ${args?.personaId}`);
  const scenario: Scenario = args.scenario
    ? { ...args.scenario, personaId: persona.id }
    : persona.defaultScenario;
  const row = await context.entities.DateSession.create({
    data: {
      userId: context.user.id,
      personaId: persona.id,
      scenario: JSON.stringify(scenario),
      status: "active",
    },
  });
  return toSessionDTO(row);
};

export const getDateSession: GetDateSession<IdArgs, DateSessionDTO> = async (args, context) =>
  toSessionDTO(await ownedSession(context, args?.id));

export const listDateSessions: ListDateSessions<void, DateSessionSummary[]> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const rows = await context.entities.DateSession.findMany({
    where: { userId: context.user.id },
    orderBy: { startedAt: "desc" },
  });
  return rows.map(toSessionSummary);
};

export const appendTranscript: AppendTranscript<AppendTranscriptArgs, TranscriptResult> = async (args, context) => {
  const row = await ownedSession(context, args?.id);
  if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
  const transcript = [...parseJson<Transcript>(row.transcript, []), ...cleanTurns(args.turns)];
  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { transcript: JSON.stringify(transcript) },
  });
  return { id: row.id, turnCount: transcript.length };
};

export const saveTranscript: SaveTranscript<SaveTranscriptArgs, TranscriptResult> = async (args, context) => {
  const row = await ownedSession(context, args?.id);
  if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
  const transcript = cleanTurns(args.transcript);
  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { transcript: JSON.stringify(transcript) },
  });
  return { id: row.id, turnCount: transcript.length };
};

/**
 * Ends the date, evaluates it, saves the evaluation and updates memory.
 * Pass `transcript` to replace the stored transcript first (optional).
 * Idempotent: calling it again on an evaluated session returns the saved evaluation.
 */
export const endDateSession: EndDateSession<EndDateSessionArgs, Evaluation> = async (args, context) => {
  const row = await ownedSession(context, args?.id);
  if (row.status === "evaluated" && row.evaluation) return parseJson<Evaluation>(row.evaluation, null as never);

  const transcript = args.transcript ? cleanTurns(args.transcript) : parseJson<Transcript>(row.transcript, []);
  const scenario = parseJson<Scenario>(row.scenario, getPersona(row.personaId)!.defaultScenario);

  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { status: "ended", endedAt: new Date(), transcript: JSON.stringify(transcript) },
  });

  const evaluation = await evaluateTranscript(transcript, scenario);

  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { status: "evaluated", evaluation: JSON.stringify(evaluation) },
  });
  await saveMemory(context.user!.id, evaluation, { sessionId: row.id, personaId: row.personaId });
  return evaluation;
};

export const getNextScenario: GetNextScenario<GetNextScenarioArgs, Scenario> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const memory = await getMemory(context.user.id);
  return generateNextScenario(memory, args ? args.personaId : undefined);
};

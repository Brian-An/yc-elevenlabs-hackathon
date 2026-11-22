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
import { pendingCallback, updateCallbacks } from "./callbacks";
import { evaluateMoves, evaluateTranscript, generateNextScenario } from "./evaluator";
import { getMemory, saveMemory } from "./memory";
import { gradePendingMoves, gradePendingMovesInBackground, toMoveEvaluation } from "./moves";
import { getPersona, listPersonas } from "./personas";
import { asJson, readJson, toSessionDTO, toSessionSummary } from "./serialize";
import { ensureUser, userIdFrom, type WithUser } from "./user";

type Ctx = { entities: { DateSession: any } };

async function ownedSession(context: Ctx, args: IdArgs) {
  const userId = userIdFrom(args);
  const id = args?.id;
  if (typeof id !== "string" || !id) throw new HttpError(400, "id is required");
  const row = await context.entities.DateSession.findFirst({ where: { id, userId } });
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
  const userId = await ensureUser(args);
  const persona = getPersona(args?.personaId);
  if (!persona) throw new HttpError(400, `Unknown personaId: ${args?.personaId}`);
  const scenario: Scenario = args.scenario
    ? { ...args.scenario, personaId: persona.id }
    : persona.defaultScenario;
  const row = await context.entities.DateSession.create({
    data: {
      userId,
      personaId: persona.id,
      scenario: asJson(scenario),
      status: "active",
      userContext: await pendingCallback(userId, persona.id),
    },
  });
  return toSessionDTO(row);
};

function sessionContext(row: DateSession) {
  const persona = getPersona(row.personaId)!;
  return { persona, scenario: readJson<Scenario>(row.scenario, persona.defaultScenario) };
}

export const getDateSession: GetDateSession<IdArgs, DateSessionDTO> = async (args, context) => {
  const row = await ownedSession(context, args);
  const moves = await context.entities.Move.findMany({ where: { sessionId: row.id }, orderBy: { turnIndex: "asc" } });
  return toSessionDTO(row, moves.map(toMoveEvaluation));
};

export const listDateSessions: ListDateSessions<WithUser, DateSessionSummary[]> = async (args, context) => {
  const rows = await context.entities.DateSession.findMany({
    where: { userId: userIdFrom(args) },
    orderBy: { startedAt: "desc" },
  });
  return rows.map(toSessionSummary);
};

export const appendTranscript: AppendTranscript<AppendTranscriptArgs, TranscriptResult> = async (args, context) => {
  const row = await ownedSession(context, args);
  if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
  const transcript = [...readJson<Transcript>(row.transcript, []), ...cleanTurns(args.turns)];
  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { transcript: asJson(transcript) },
  });
  // Grade before returning: Wasp then refetches getDateSession, which carries the new grades to the live badges.
  // Callers don't wait on this action, so grading never holds up the call.
  const { persona, scenario } = sessionContext(row);
  await gradePendingMoves(row.id, transcript, scenario, persona);
  return { id: row.id, turnCount: transcript.length };
};

export const saveTranscript: SaveTranscript<SaveTranscriptArgs, TranscriptResult> = async (args, context) => {
  const row = await ownedSession(context, args);
  if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
  const transcript = cleanTurns(args.transcript);
  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { transcript: asJson(transcript) },
  });
  // Turn indices may have shifted, so regrade from scratch.
  await context.entities.Move.deleteMany({ where: { sessionId: row.id } });
  const { persona, scenario } = sessionContext(row);
  gradePendingMovesInBackground(row.id, transcript, scenario, persona);
  return { id: row.id, turnCount: transcript.length };
};

/**
 * Ends the date, evaluates it, saves the evaluation and updates memory.
 * Pass `transcript` to replace the stored transcript first (optional).
 * Idempotent: calling it again on an evaluated session returns the saved evaluation.
 */
export const endDateSession: EndDateSession<EndDateSessionArgs, Evaluation> = async (args, context) => {
  const row = await ownedSession(context, args);
  if (row.status === "evaluated" && row.evaluation) return readJson<Evaluation>(row.evaluation, null as never);

  const transcript = args.transcript ? cleanTurns(args.transcript) : readJson<Transcript>(row.transcript, []);
  const { persona, scenario } = sessionContext(row);

  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { status: "ended", endedAt: new Date(), transcript: asJson(transcript) },
  });
  // A replaced transcript may have shifted turn indices, so regrade from scratch.
  if (args.transcript) await context.entities.Move.deleteMany({ where: { sessionId: row.id } });

  const moves = await gradePendingMoves(row.id, transcript, scenario, persona);
  const evaluation = moves.length ? evaluateMoves(transcript, scenario, moves) : await evaluateTranscript(transcript, scenario);

  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { status: "evaluated", evaluation: asJson(evaluation) },
  });
  await saveMemory(row.userId, evaluation, { sessionId: row.id, personaId: row.personaId });
  await updateCallbacks({ ...row, transcript });
  return evaluation;
};

export const getNextScenario: GetNextScenario<GetNextScenarioArgs, Scenario> = async (args) => {
  const memory = await getMemory(userIdFrom(args));
  return generateNextScenario(memory, args.personaId);
};

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
import { jevEnabled } from "./jev";
import { getMemory, saveMemory } from "./memory";
import { gradePendingMoves, gradePendingMovesInBackground, movesForTranscript } from "./moves";
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
  const { persona, scenario } = sessionContext(row);
  const moves = await context.entities.Move.findMany({ where: { sessionId: row.id } });
  const transcript = readJson<Transcript>(row.transcript, []);
  return toSessionDTO(row, movesForTranscript(moves, transcript, scenario, persona, row.status === "evaluated"));
};

export const listDateSessions: ListDateSessions<WithUser, DateSessionSummary[]> = async (args, context) => {
  const rows = await context.entities.DateSession.findMany({
    where: { userId: userIdFrom(args) },
    orderBy: { startedAt: "desc" },
  });
  return rows.map(toSessionSummary);
};

export const appendTranscript: AppendTranscript<AppendTranscriptArgs, TranscriptResult> = async (args, context) => {
  const turns = cleanTurns(args.turns);
  for (;;) {
    const row = await ownedSession(context, args);
    if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
    const transcript = [...readJson<Transcript>(row.transcript, []), ...turns];
    const { count } = await context.entities.DateSession.updateMany({
      where: { id: row.id, status: "active", transcript: { equals: asJson(row.transcript) } },
      data: { transcript: asJson(transcript) },
    });
    if (!count) continue;

    // Wasp refetches the live badges after grading. The voice call does not wait on this action.
    const { persona, scenario } = sessionContext(row);
    await gradePendingMoves(row.id, transcript, scenario, persona);
    return { id: row.id, turnCount: transcript.length };
  }
};

export const saveTranscript: SaveTranscript<SaveTranscriptArgs, TranscriptResult> = async (args, context) => {
  const row = await ownedSession(context, args);
  if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
  const transcript = cleanTurns(args.transcript);
  const { count } = await context.entities.DateSession.updateMany({
    where: { id: row.id, status: "active" },
    data: { transcript: asJson(transcript) },
  });
  if (!count) throw new HttpError(409, "Date session has already ended");
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
  const moves = await gradePendingMoves(row.id, transcript, scenario, persona);
  const replyCount = transcript.filter((turn) => turn.speaker === "user").length;
  const gradingEnabled = jevEnabled();
  const complete = moves.length === replyCount;
  const evaluation = moves.length ? evaluateMoves(transcript, scenario, moves) : await evaluateTranscript(transcript, scenario);
  if (gradingEnabled && !complete) {
    const coverage = `Jev graded ${moves.length} of ${replyCount} replies.`;
    const fallback = moves.length ? "" : " This feedback uses the transcript-based fallback.";
    evaluation.summary = `${coverage}${fallback} ${evaluation.summary}`;
  }

  await context.entities.DateSession.update({
    where: { id: row.id },
    data: { status: "evaluated", evaluation: asJson(evaluation) },
  });
  if (replyCount && (!gradingEnabled || complete)) {
    await saveMemory(row.userId, evaluation, { sessionId: row.id, personaId: row.personaId });
  }
  await updateCallbacks({ ...row, transcript });
  return evaluation;
};

export const getNextScenario: GetNextScenario<GetNextScenarioArgs, Scenario> = async (args) => {
  const memory = await getMemory(userIdFrom(args));
  return generateNextScenario(memory, args.personaId);
};

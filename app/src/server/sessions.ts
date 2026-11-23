import type { DateSession } from "wasp/entities";
import { HttpError, prisma } from "wasp/server";
import type {
  AppendTranscript,
  CreateDateSession,
  EndDateSession,
  GetDateSession,
  GetNextScenario,
  GetPersonas,
  ListDateSessions,
  RetryDateReview,
  SaveTranscript,
} from "wasp/server/operations";
import type { Scenario, SkillName, Transcript, TranscriptTurn } from "../shared/types";
import type {
  AppendTranscriptArgs,
  CreateDateSessionArgs,
  DateSessionDTO,
  DateSessionSummary,
  EndDateSessionArgs,
  GetNextScenarioArgs,
  IdArgs,
  PersonaWithScenario,
  Preferences,
  SaveTranscriptArgs,
  TranscriptResult,
} from "./dto";
import { pendingCallback, updateCallbacks } from "./callbacks";
import { enqueueReview, latestReviewJob, MAX_ATTEMPTS, toReviewJobDTO, wakeReview } from "./reviewJobs";
import { mergeTurns } from "./transcript";
import { generateNextScenario, SKILLS } from "./evaluator";
import { getMemory } from "./memory";
import { gradePendingMoves, gradePendingMovesInBackground, movesForTranscript } from "./moves";
import { getPersona, listPersonas } from "./personas";
import { asJson, readJson, summaryColumns, toSessionDTO, toSessionSummary, transcriptColumns } from "./serialize";
import { ensureUser, userIdFrom, type WithUser } from "./user";

type Ctx = { entities: { DateSession: Pick<typeof prisma.dateSession, "findFirst"> } };

async function ownedSession(context: Ctx, args: IdArgs) {
  const userId = userIdFrom(args);
  const id = args?.id;
  if (typeof id !== "string" || !id) throw new HttpError(400, "id is required");
  const row = await context.entities.DateSession.findFirst({ where: { id, userId } });
  if (!row) throw new HttpError(404, "Date session not found");
  return row;
}

function cleanTurns(turns: unknown): TranscriptTurn[] {
  if (!Array.isArray(turns)) throw new HttpError(400, "turns must be an array");
  return turns
    .filter((t) => t && (t.speaker === "user" || t.speaker === "agent") && typeof t.text === "string")
    .filter((t) => t.text.trim())
    .map((t) => ({
      speaker: t.speaker,
      text: t.text,
      timestamp: Number(t.timestamp) || 0,
      ...(Number.isSafeInteger(t.sequence) && t.sequence >= 0 ? { sequence: t.sequence } : {}),
      ...(Number.isSafeInteger(t.revision) && t.revision >= 0 ? { revision: t.revision } : {}),
    }));
}

export const getPersonas: GetPersonas<void, PersonaWithScenario[]> = async () => listPersonas();

export const createDateSession: CreateDateSession<CreateDateSessionArgs, DateSessionDTO> = async (args, context) => {
  const userId = await ensureUser(args);
  const persona = getPersona(args?.personaId);
  if (!persona) throw new HttpError(400, `Unknown personaId: ${args?.personaId}`);
  const scenario: Scenario = args.scenario
    ? { ...args.scenario, personaId: persona.id }
    : persona.defaultScenario;
  const kind = persona.id === "coach" ? "coaching" : "date";
  const source = persona.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID ? "live" : "demo";
  const coachSourceSessionId = args.coachSourceSessionId;
  if (coachSourceSessionId != null) {
    if (kind !== "coaching" || typeof coachSourceSessionId !== "string") {
      throw new HttpError(400, "Choose a reviewed date for a coaching session");
    }
    const reviewed = await context.entities.DateSession.findFirst({
      where: { id: coachSourceSessionId, userId, kind: "date", source: "live", reviewStatus: "ready" },
      select: { id: true },
    });
    if (!reviewed) throw new HttpError(404, "Date review not found");
  }
  const row = await context.entities.DateSession.create({
    data: {
      userId,
      personaId: persona.id,
      kind,
      source,
      coachSourceSessionId,
      scenario: asJson(scenario),
      status: "active",
      userContext: kind === "date" && source === "live" ? await pendingCallback(userId, persona.id) : null,
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
  const [moves, job] = await Promise.all([
    context.entities.Move.findMany({ where: { sessionId: row.id } }),
    latestReviewJob(row.id),
  ]);
  const transcript = readJson<Transcript>(row.transcript, []);
  return toSessionDTO(row, movesForTranscript(moves, transcript, scenario, persona, row.status === "evaluated"), toReviewJobDTO(job));
};

export const listDateSessions: ListDateSessions<WithUser, DateSessionSummary[]> = async (args, context) => {
  const rows = await context.entities.DateSession.findMany({
    where: { userId: userIdFrom(args) },
    orderBy: { startedAt: "desc" },
    select: summaryColumns,
  });
  return rows.map(toSessionSummary);
};

export const appendTranscript: AppendTranscript<AppendTranscriptArgs, TranscriptResult> = async (args, context) => {
  const turns = cleanTurns(args.turns);
  for (;;) {
    const row = await ownedSession(context, args);
    if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
    const transcript = mergeTurns(readJson<Transcript>(row.transcript, []), turns);
    const { count } = await context.entities.DateSession.updateMany({
      where: { id: row.id, status: "active", transcript: { equals: asJson(row.transcript) } },
      data: transcriptColumns(transcript),
    });
    if (!count) continue;

    // Wasp refetches the live badges after grading. The voice call does not wait on this action.
    const { persona, scenario } = sessionContext(row);
    if (row.kind === "date" && row.source === "live") await gradePendingMoves(row.id, transcript, scenario, persona);
    return { id: row.id, turnCount: transcript.length };
  }
};

export const saveTranscript: SaveTranscript<SaveTranscriptArgs, TranscriptResult> = async (args, context) => {
  const row = await ownedSession(context, args);
  if (row.status !== "active") throw new HttpError(409, "Date session has already ended");
  const transcript = cleanTurns(args.transcript);
  const { count } = await context.entities.DateSession.updateMany({
    where: { id: row.id, status: "active" },
    data: transcriptColumns(transcript),
  });
  if (!count) throw new HttpError(409, "Date session has already ended");
  const { persona, scenario } = sessionContext(row);
  if (row.kind === "date" && row.source === "live") gradePendingMovesInBackground(row.id, transcript, scenario, persona);
  return { id: row.id, turnCount: transcript.length };
};

// Frozen transcripts are immutable. The conditional update arbitrates both finalization and late appends.
// An eligible date gets its review job in the same transaction, so a committed end always has a job.
async function freezeSession(row: DateSession, supplied: Transcript | undefined): Promise<DateSession> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.dateSession.updateMany({
      where: { id: row.id, userId: row.userId, status: "active" },
      data: { status: "ended", endedAt: new Date(), ...(supplied ? transcriptColumns(supplied) : {}) },
    });
    const readFrozen = () => tx.dateSession.findUniqueOrThrow({ where: { id: row.id } });
    if (!count) return readFrozen();
    const frozen = await readFrozen();
    const transcript = readJson<Transcript>(frozen.transcript, []);
    const eligible = frozen.kind === "date" && frozen.source === "live" && transcript.some((turn) => turn.speaker === "user");
    if (!eligible) return tx.dateSession.update({ where: { id: row.id }, data: { status: "evaluated", reviewStatus: "skipped" } });
    await updateCallbacks({ ...frozen, transcript }, tx);
    await enqueueReview(tx, frozen);
    return tx.dateSession.update({ where: { id: row.id }, data: { reviewStatus: "pending" } });
  });
}

async function withReviewJob(row: DateSession): Promise<DateSessionDTO> {
  return toSessionDTO(row, [], toReviewJobDTO(await latestReviewJob(row.id)));
}

/** Ends the date and returns as soon as the transcript is saved. The review runs in a background job. */
export const endDateSession: EndDateSession<EndDateSessionArgs, DateSessionDTO> = async (args, context) => {
  const row = await ownedSession(context, args);
  const frozen = row.status === "active"
    ? await freezeSession(row, args.transcript === undefined ? undefined : cleanTurns(args.transcript))
    : row;
  const job = frozen.status === "ended" ? await latestReviewJob(frozen.id) : null;
  if (job?.status === "queued") await wakeReview(job.id);
  return toSessionDTO(frozen, [], toReviewJobDTO(job));
};

/**
 * Gives a review that ran out of attempts a new attempt budget, or creates the job for a date that ended
 * before review jobs existed. Concurrent retries are arbitrated by the conditional update and the claim.
 */
export const retryDateReview: RetryDateReview<IdArgs, DateSessionDTO> = async (args, context) => {
  const row = await ownedSession(context, args);
  if (row.status !== "ended" || row.kind !== "date" || row.source !== "live") return withReviewJob(row);
  const job = await prisma.$transaction(async (tx) => {
    const current = await enqueueReview(tx, row);
    if (current.status === "failed") {
      await tx.reviewJob.updateMany({
        where: { id: current.id, status: "failed" },
        // The earlier failure no longer describes the job, which is due now.
        data: { status: "queued", runAfter: new Date(), maxAttempts: current.attempts + MAX_ATTEMPTS, failureClass: null, finishedAt: null },
      });
    }
    // Also covers a date whose review failed before review jobs existed.
    await tx.dateSession.updateMany({ where: { id: row.id, status: "ended", reviewStatus: "failed" }, data: { reviewStatus: "pending" } });
    return current;
  });
  await wakeReview(job.id);
  return withReviewJob(await prisma.dateSession.findUniqueOrThrow({ where: { id: row.id } }));
};

export const getNextScenario: GetNextScenario<GetNextScenarioArgs, Scenario> = async (args, context) => {
  const userId = userIdFrom(args);
  const memory = await getMemory(userId);
  if (!memory.trainingFocus) {
    const user = await context.entities.User.findUnique({ where: { id: userId }, select: { preferences: true } });
    const focus = readJson<Preferences>(user?.preferences, {}).focusSkills;
    if (Array.isArray(focus)) memory.trainingFocus = focus.find((skill): skill is SkillName => SKILLS.includes(skill as SkillName)) ?? null;
  }
  return generateNextScenario(memory, args.personaId);
};

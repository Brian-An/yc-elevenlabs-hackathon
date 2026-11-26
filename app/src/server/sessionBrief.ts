import { prisma } from "wasp/server";
import type { DateReview } from "../shared/dateReview";
import type { Scenario, Transcript } from "../shared/types";
import { resolvePersona } from "./personas";
import { buildSessionVariables, type SessionVariables } from "./sessionVariables";
import { userIdFrom } from "./user";

export type { SessionVariables };

type Connection = {
  personaId: string;
  agentId: string;
  dynamicVariables: SessionVariables;
  /** A generated character's voice, sent as a per-session override. The agent must allow voice overrides. */
  voiceId: string | null;
  /** A generated character's matched Anam avatar. */
  avatarId: string | null;
};
type ConnectionError = { error: string; status: number };

export async function resolveCallSession(sessionId: unknown, identity: unknown): Promise<Connection | ConnectionError> {
  let userId: string;
  try {
    userId = userIdFrom({ userId: identity });
  } catch {
    return { status: 400, error: "A valid browser user ID is required." };
  }
  if (typeof sessionId !== "string" || !sessionId) return { status: 400, error: "A session ID is required." };
  const session = await prisma.dateSession.findFirst({ where: { id: sessionId, userId }, select: {
    personaId: true, status: true, startedAt: true, source: true, coachSourceSessionId: true, scenario: true,
    userContext: true, user: { select: { goals: true } },
  } });
  if (!session) return { status: 404, error: "Session not found." };
  if (session.status !== "active" || session.source === "demo") return { status: 409, error: "This session cannot start a live call." };
  const resolved = await resolvePersona(session.personaId, userId);
  if (!resolved) return { status: 400, error: "Unknown persona." };
  const { persona } = resolved;
  const agentId = persona.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return { status: 503, error: "No voice agent is configured for this session." };

  const previous = persona.id === "coach" ? await prisma.dateSession.findFirst({
    where: { userId, kind: "date", source: "live", status: "evaluated", reviewStatus: "ready",
      endedAt: { lte: session.startedAt }, ...(session.coachSourceSessionId && { id: session.coachSourceSessionId }) },
    orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    select: { personaId: true, endedAt: true, transcript: true, review: true },
  }) : null;
  const reviewedDate = previous?.review ? {
    partner: (await resolvePersona(previous.personaId, userId))?.persona.name ?? "your date",
    endedAt: previous.endedAt,
    review: previous.review as unknown as DateReview,
    transcript: previous.transcript as unknown as Transcript,
  } : null;
  return {
    personaId: persona.id, agentId, voiceId: resolved.voiceId, avatarId: resolved.avatarId,
    dynamicVariables: buildSessionVariables(
      resolved, (session.scenario as unknown as Scenario) ?? persona.defaultScenario,
      session.userContext, session.user.goals, reviewedDate,
    ),
  };
}

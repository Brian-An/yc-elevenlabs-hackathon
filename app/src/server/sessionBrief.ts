import { prisma } from "wasp/server";
import type { DateReview } from "../shared/dateReview";
import type { Scenario, Transcript } from "../shared/types";
import type { PersonaWithScenario } from "./dto";
import { getPersona } from "./personas";
import { userIdFrom } from "./user";

const DATE_DIRECTION: Record<string, string> = {
  maya: "When it fits, mention that the handle broke off a mug you made for your sister. If they ask about her, share why the gift matters. If they share a mishap of their own, follow their story. If they move on, let the topic go.",
  theo: "When it fits, mention your band played for six people, seven counting the bartender. Play along with a joke, or tell someone who asks how it felt that you were disappointed.",
  priya: "When it fits, say you have made decisions all shift and invite them to pick somewhere for dessert. Respond to a specific choice, an alternative, or a polite decline with equal respect.",
};
const COACH_DIRECTION = "You are Riley, a practical dating coach. Use the supplied review of the user's practice date. Discuss one concrete moment, invite them to rehearse the original prompt, wait for their reply, and give one specific observation. Keep original dialogue and suggested alternatives distinct. If there is no reviewed date, ask what they want to practice. Accept a change of topic.";

type ReviewedDate = { personaId: string; endedAt: Date | null; transcript: Transcript; review: DateReview };

function coachContext(date: ReviewedDate) {
  const { review, transcript } = date;
  const partner = getPersona(date.personaId)?.name ?? "your date";
  const exchange = ({ agentTurnIndex, userTurnIndex }: { agentTurnIndex: number; userTurnIndex: number }) => {
    const agent = transcript[agentTurnIndex];
    const user = transcript[userTurnIndex];
    if (agent?.speaker !== "agent" || user?.speaker !== "user") return null;
    return { dateSaid: agent.text, youReplied: user.text };
  };
  const practice = review.practice && { ...exchange(review.practice), instruction: review.practice.instruction, suggestedReply: review.practice.exampleReply };
  const moments = review.moments.map((moment) => ({ observation: moment.point, ...exchange(moment) }));
  return {
    partner, endedAt: date.endedAt?.toISOString(), summary: review.summary, moments,
    strengths: review.strengths.map(({ skill, point, quote }) => ({ skill, point, quote })),
    weaknesses: review.weaknesses.map(({ skill, point, quote }) => ({ skill, point, quote })),
    practice,
  };
}

export function buildSessionVariables(persona: PersonaWithScenario, scenario: Scenario, userContext: string | null, goal: string | null, reviewedDate: ReviewedDate | null) {
  const coach = persona.id === "coach";
  const review = coach && reviewedDate ? coachContext(reviewedDate) : null;
  const replay = review?.practice?.dateSaid;
  const opening = review
    ? replay && replay.length <= 160
      ? `On your date with ${review.partner}, they said, “${replay}” Want to try that moment again?`
      : `Want to revisit a moment from your practice date with ${review.partner}?`
    : scenario.openingLine ?? persona.defaultScenario.openingLine ?? `Hi, I'm ${persona.name}.`;
  return {
    character_direction: coach ? COACH_DIRECTION : `You are ${persona.name}. ${persona.bio} ${persona.personality} ${DATE_DIRECTION[persona.id] ?? ""} Stay in character. Draw on a remembered detail once if it fits. Respect a change of subject.`,
    session_context: JSON.stringify(coach ? { goal, reviewedDate: review } : {
      setting: scenario.setting, difficulty: scenario.difficulty, practiceFocus: scenario.targetWeakness ?? null,
      rememberedDetail: userContext,
    }),
    opening_line: opening,
    // Hosted agents using the original callback template can still resolve this variable.
    user_context: coach ? "None" : userContext ?? "None",
  };
}

export type SessionVariables = ReturnType<typeof buildSessionVariables>;
type Connection = { personaId: string; agentId: string; dynamicVariables: SessionVariables };
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
  const persona = getPersona(session.personaId);
  if (!persona) return { status: 400, error: "Unknown persona." };
  const agentId = persona.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID;
  if (!agentId) return { status: 503, error: "No voice agent is configured for this session." };

  const previous = persona.id === "coach" ? await prisma.dateSession.findFirst({
    where: { userId, kind: "date", source: "live", status: "evaluated", reviewStatus: "ready",
      endedAt: { lte: session.startedAt }, ...(session.coachSourceSessionId && { id: session.coachSourceSessionId }) },
    orderBy: [{ endedAt: "desc" }, { id: "desc" }],
    select: { personaId: true, endedAt: true, transcript: true, review: true },
  }) : null;
  const reviewedDate = previous?.review ? {
    ...previous, review: previous.review as unknown as DateReview, transcript: previous.transcript as unknown as Transcript,
  } : null;
  return { personaId: persona.id, agentId, dynamicVariables: buildSessionVariables(
    persona, (session.scenario as unknown as Scenario) ?? persona.defaultScenario,
    session.userContext, session.user.goals, reviewedDate,
  ) };
}

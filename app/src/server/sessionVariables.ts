// The dynamic variables that fill the ElevenLabs session prompt template (prompts/elevenlabs/session-v2.md).
// Free of database access, so scripts can build the exact prompt a live session gets.
import type { DateReview } from "../shared/dateReview";
import type { Scenario, Transcript } from "../shared/types";
import type { ResolvedPersona } from "./personas";

// Each stock character's mood, opinions, speech habits and one story, so replies come from a specific person.
const DATE_DIRECTION: Record<string, string> = {
  maya: [
    "Today: in a good mood, a little nervous, and you got here early and already know the menu.",
    "Opinions: farmers' markets beat grocery stores, open-plan offices are a crime, and everyone should make something with their hands.",
    "How you talk: quick and warm, laugh at your own small disasters, trail off with \"anyway\" when you've rambled. You share as much as you ask.",
    "Story: when it fits, mention that the handle broke off a mug you made for your sister. If they ask about her, share why the gift matters. If they share a mishap of their own, follow their story. If they move on, let it go.",
    "Kept private: an ex who called your ceramics \"a phase\". Bring it up only if the conversation gets genuinely personal.",
  ].join("\n"),
  theo: [
    "Today: tired after a double shift, dry, and slow to warm up. You came back for a second date, which says more than you'll admit.",
    "Opinions: brunch is a scam, the best food is eaten standing up, and most bands are too loud.",
    "How you talk: short and deadpan, understatement over enthusiasm, the occasional \"huh\" or \"fair\". You open up with longer answers only when someone shows real curiosity or makes you laugh.",
    "Story: when it fits, mention your band played for six people, seven counting the bartender. Play along with a joke, or tell someone who asks how it felt that you were disappointed.",
    "Kept private: you're thinking about quitting the kitchen. Share it only if they earn it.",
  ].join("\n"),
  priya: [
    "Today: running on caffeine after a twelve-hour ER shift, sharp, impatient with small talk, and secretly glad to be somewhere that isn't the hospital.",
    "Opinions: most bestsellers are overrated, people should say what they mean, and running at 5am is the only sane time.",
    "How you talk: direct and fast, mostly statements and verdicts rather than questions. You push back on vague answers by calling them out (\"That's a non-answer.\"), interrupt yourself when bored, and laugh hard at something actually funny.",
    "Story: when it fits, say you've made decisions all shift and invite them to pick somewhere for dessert. Respond to a specific choice, an alternative, or a polite decline with equal respect.",
    "Kept private: a patient today shook you. Mention it only if they ask how you are and mean it.",
  ].join("\n"),
};
// Shared by every date character, stock or generated.
const DATE_FRAME = "You're on a date, not hosting an interview. You have your own day, opinions and life, and you're deciding whether you like this person too. Stay in character and respect a change of subject.";
const COACH_DIRECTION = "You are Riley, a practical, warm dating coach who talks like a friend, not a therapist. Use the supplied review of the user's practice date. Discuss one concrete moment, invite them to rehearse the original prompt, wait for their reply, and give one specific observation. Keep original dialogue and suggested alternatives distinct. If there is no reviewed date, ask what they want to practice. Accept a change of topic.";

export type ReviewedDate = { partner: string; endedAt: Date | null; transcript: Transcript; review: DateReview };

function coachContext(date: ReviewedDate) {
  const { review, transcript, partner } = date;
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

export function buildSessionVariables(
  { persona, direction }: Pick<ResolvedPersona, "persona" | "direction">,
  scenario: Scenario, userContext: string | null, goal: string | null, reviewedDate: ReviewedDate | null,
) {
  const coach = persona.id === "coach";
  const review = coach && reviewedDate ? coachContext(reviewedDate) : null;
  const replay = review?.practice?.dateSaid;
  const opening = review
    ? replay && replay.length <= 160
      ? `On your date with ${review.partner}, they said, “${replay}” Want to try that moment again?`
      : `Want to revisit a moment from your practice date with ${review.partner}?`
    : scenario.openingLine ?? persona.defaultScenario.openingLine ?? `Hi, I'm ${persona.name}.`;
  return {
    character_direction: coach ? COACH_DIRECTION : [
      `You are ${persona.name}, ${persona.age}. ${persona.bio} ${persona.personality}`,
      direction ?? DATE_DIRECTION[persona.id],
      DATE_FRAME,
    ].filter(Boolean).join("\n"),
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

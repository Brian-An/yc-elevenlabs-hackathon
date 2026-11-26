import { action, api, apiNamespace, app, job, page, query, route } from "@wasp.sh/spec";
import { OnboardingPage } from "./src/pages/OnboardingPage" with { type: "ref" };
import { DatePage } from "./src/pages/DatePage" with { type: "ref" };
import { FeedbackPage } from "./src/pages/FeedbackPage" with { type: "ref" };
import { WorldPage } from "./src/pages/WorldPage" with { type: "ref" };
import {
  getProfile,
  updateProfile,
  getMemory,
} from "./src/server/profile" with { type: "ref" };
import {
  getPersonas,
  createDateSession,
  getDateSession,
  listDateSessions,
  appendTranscript,
  saveTranscript,
  endDateSession,
  retryDateReview,
  getNextScenario,
} from "./src/server/sessions" with { type: "ref" };
import { runDateReview, sweepDateReviews } from "./src/server/reviewJobs" with { type: "ref" };
import {
  generateCustomPersona,
  updateCustomPersona,
  deleteCustomPersona,
} from "./src/server/customPersonas" with { type: "ref" };
import { refreshAvatarCatalog } from "./src/server/avatarCatalog" with { type: "ref" };
import { getCoachingRecap } from "./src/server/coachingRecap" with { type: "ref" };
import {
  getElevenLabsSignedUrl,
  elevenLabsMiddleware,
} from "./src/server/elevenlabs" with { type: "ref" };
import {
  getAnamSessionToken,
  anamMiddleware,
} from "./src/server/anam" with { type: "ref" };

export default app({
  name: "bantr",
  wasp: { version: "^0.26.0" },
  title: "bantr",
  head: ["<link rel='icon' href='/favicon.ico' sizes='any' />", "<link rel='icon' href='/favicon.svg' type='image/svg+xml' />"],
  spec: [
    // No login: each browser keeps a user ID in localStorage (src/client/userId.ts)
    // and passes it as `userId` in every operation's args.
    route("WorldRoute", "/", page(WorldPage)),
    route("OnboardingRoute", "/onboarding", page(OnboardingPage)),
    route("DateRoute", "/date/:sessionId", page(DatePage)),
    route("FeedbackRoute", "/feedback/:sessionId", page(FeedbackPage)),

    // Profile + memory
    query(getProfile, { entities: ["User", "UserMemory"] }),
    action(updateProfile, { entities: ["User", "UserMemory"] }),
    query(getMemory, { entities: ["UserMemory"] }),

    // Personas + date sessions
    query(getPersonas, { entities: ["CustomPersona"] }),
    action(createDateSession, { entities: ["User", "DateSession", "UserMemory", "PersonaCallback"] }),
    query(getDateSession, { entities: ["DateSession", "Move", "ReviewJob"] }),
    query(listDateSessions, { entities: ["DateSession"] }),
    action(appendTranscript, { entities: ["DateSession", "Move"] }),
    action(saveTranscript, { entities: ["DateSession", "Move"] }),
    action(endDateSession, { entities: ["DateSession", "Move", "ReviewJob", "PersonaCallback"] }),
    action(retryDateReview, { entities: ["DateSession", "ReviewJob"] }),
    query(getCoachingRecap, { entities: ["DateSession"] }),
    query(getNextScenario, { entities: ["User", "UserMemory"] }),

    // Practice characters users generate from a description
    action(generateCustomPersona, { entities: ["User", "CustomPersona", "AvatarProfile"] }),
    action(updateCustomPersona, { entities: ["CustomPersona"] }),
    action(deleteCustomPersona, { entities: ["CustomPersona", "PersonaCallback"] }),
    // Describes Anam avatars from their previews so generated characters get a matching video avatar. Anam's
    // preview links last at least an hour, so a half-hourly sync keeps the stored links valid.
    job(refreshAvatarCatalog, { executor: "PgBoss", entities: ["AvatarProfile", "CustomPersona"], schedule: { cron: "*/30 * * * *" } }),

    // Whole-date reviews. A ReviewJob row is the durable queue entry; runDateReview is its fast wake-up,
    // and the sweep recovers lost wake-ups, expired leases, and reviews waiting on configuration.
    job(runDateReview, { executor: "PgBoss", entities: ["DateSession", "ReviewJob", "UserMemory"] }),
    job(sweepDateReviews, {
      executor: "PgBoss",
      entities: ["DateSession", "ReviewJob", "UserMemory"],
      schedule: { cron: "* * * * *" },
    }),

    // ElevenLabs signed URL for the Conversational AI widget/SDK
    apiNamespace("/api/elevenlabs", { middlewareConfigFn: elevenLabsMiddleware }),
    api("GET", "/api/elevenlabs/signed-url", getElevenLabsSignedUrl),

    // Anam session token (real-time lip-synced video of the ElevenLabs agent)
    apiNamespace("/api/anam", { middlewareConfigFn: anamMiddleware }),
    api("GET", "/api/anam/session-token", getAnamSessionToken),
  ],
});

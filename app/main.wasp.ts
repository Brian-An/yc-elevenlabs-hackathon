import { action, api, apiNamespace, app, page, query, route } from "@wasp.sh/spec";
import { OnboardingPage } from "./src/pages/OnboardingPage" with { type: "ref" };
import { DashboardPage } from "./src/pages/DashboardPage" with { type: "ref" };
import { DatePage } from "./src/pages/DatePage" with { type: "ref" };
import { FeedbackPage } from "./src/pages/FeedbackPage" with { type: "ref" };
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
  getNextScenario,
} from "./src/server/sessions" with { type: "ref" };
import {
  getElevenLabsSignedUrl,
  elevenLabsMiddleware,
} from "./src/server/elevenlabs" with { type: "ref" };

export default app({
  name: "bantr",
  wasp: { version: "^0.26.0" },
  title: "bantr",
  head: ["<link rel='icon' href='/favicon.ico' />"],
  spec: [
    // No login: each browser keeps a user ID in localStorage (src/client/userId.ts)
    // and passes it as `userId` in every operation's args.
    route("DashboardRoute", "/", page(DashboardPage)),
    route("OnboardingRoute", "/onboarding", page(OnboardingPage)),
    route("DateRoute", "/date/:sessionId", page(DatePage)),
    route("FeedbackRoute", "/feedback/:sessionId", page(FeedbackPage)),

    // Profile + memory
    query(getProfile, { entities: ["User", "UserMemory"] }),
    action(updateProfile, { entities: ["User", "UserMemory"] }),
    query(getMemory, { entities: ["UserMemory"] }),

    // Personas + date sessions
    query(getPersonas),
    action(createDateSession, { entities: ["User", "DateSession", "UserMemory"] }),
    query(getDateSession, { entities: ["DateSession"] }),
    query(listDateSessions, { entities: ["DateSession"] }),
    action(appendTranscript, { entities: ["DateSession"] }),
    action(saveTranscript, { entities: ["DateSession"] }),
    action(endDateSession, { entities: ["DateSession", "UserMemory"] }),
    query(getNextScenario, { entities: ["UserMemory"] }),

    // ElevenLabs signed URL for the Conversational AI widget/SDK
    apiNamespace("/api/elevenlabs", { middlewareConfigFn: elevenLabsMiddleware }),
    api("GET", "/api/elevenlabs/signed-url", getElevenLabsSignedUrl),
  ],
});

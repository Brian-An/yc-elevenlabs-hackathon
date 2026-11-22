import { action, api, apiNamespace, app, page, query, route } from "@wasp.sh/spec";
import { LandingPage } from "./src/pages/LandingPage" with { type: "ref" };
import { LoginPage } from "./src/pages/LoginPage" with { type: "ref" };
import { SignupPage } from "./src/pages/SignupPage" with { type: "ref" };
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
  name: "datingSandbox",
  wasp: { version: "^0.26.0" },
  title: "Dating Sandbox",
  head: ["<link rel='icon' href='/favicon.ico' />"],
  auth: {
    userEntity: "User",
    methods: { usernameAndPassword: {} },
    onAuthFailedRedirectTo: "/login",
    onAuthSucceededRedirectTo: "/dashboard",
  },
  spec: [
    route("LandingRoute", "/", page(LandingPage)),
    route("LoginRoute", "/login", page(LoginPage)),
    route("SignupRoute", "/signup", page(SignupPage)),
    route("OnboardingRoute", "/onboarding", page(OnboardingPage, { authRequired: true })),
    route("DashboardRoute", "/dashboard", page(DashboardPage, { authRequired: true })),
    route("DateRoute", "/date/:sessionId", page(DatePage, { authRequired: true })),
    route("FeedbackRoute", "/feedback/:sessionId", page(FeedbackPage, { authRequired: true })),

    // Profile + memory
    query(getProfile, { entities: ["User", "UserMemory"] }),
    action(updateProfile, { entities: ["User", "UserMemory"] }),
    query(getMemory, { entities: ["UserMemory"] }),

    // Personas + date sessions
    query(getPersonas),
    action(createDateSession, { entities: ["DateSession", "UserMemory"] }),
    query(getDateSession, { entities: ["DateSession"] }),
    query(listDateSessions, { entities: ["DateSession"] }),
    action(appendTranscript, { entities: ["DateSession"] }),
    action(saveTranscript, { entities: ["DateSession"] }),
    action(endDateSession, { entities: ["DateSession", "UserMemory"] }),
    query(getNextScenario, { entities: ["UserMemory"] }),

    // ElevenLabs signed URL for the Conversational AI widget/SDK
    apiNamespace("/api/elevenlabs", { middlewareConfigFn: elevenLabsMiddleware }),
    api("GET", "/api/elevenlabs/signed-url", getElevenLabsSignedUrl, { auth: true }),
  ],
});

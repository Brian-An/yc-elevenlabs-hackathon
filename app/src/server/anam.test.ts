import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAnamSessionToken } from "./anam";

const { resolveCallSession } = vi.hoisted(() => ({ resolveCallSession: vi.fn() }));
vi.mock("./sessionBrief", () => ({ resolveCallSession }));
const variables = { opening_line: "Hello", session_context: "{}", character_direction: "Practice", user_context: "None" };

const fetchMock = vi.fn<typeof fetch>();
const anamCall = () => fetchMock.mock.calls.find(([url]) => String(url).startsWith("https://api.anam.ai"));
const anamBody = () => JSON.parse(anamCall()?.[1]?.body as string);

beforeEach(() => {
  vi.stubEnv("ANAM_API_KEY", "anam-key");
  vi.stubEnv("ANAM_AVATAR_ID", "shared-avatar");
  vi.stubEnv("ANAM_AVATAR_ID_PRIYA", "priya-avatar");
  vi.stubEnv("ELEVENLABS_API_KEY", "eleven-key");
  resolveCallSession.mockReset();
  resolveCallSession.mockResolvedValue({ agentId: "priya-agent", personaId: "priya", dynamicVariables: variables, voiceId: null, avatarId: null });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url) => String(url).includes("elevenlabs")
    ? Response.json({ signed_url: "wss://signed" })
    : Response.json({ sessionToken: "token" }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function requestToken() {
  const response = { status: vi.fn(), json: vi.fn(), set: vi.fn() };
  response.status.mockReturnValue(response);
  // The HTTP boundary supplies Express objects; the handler only reads query and writes JSON here.
  const handler = getAnamSessionToken as unknown as (
    request: { query: Record<string, string>; get: (key: string) => string },
    reply: typeof response,
  ) => Promise<void>;
  await handler({ query: { sessionId: "date" }, get: () => "user" }, response);
  return response;
}

describe("Anam session token", () => {
  it("connects the persona's avatar to the session's agent with a fresh signed URL and its variables", async () => {
    const response = await requestToken();
    expect(anamCall()?.[1]?.headers).toMatchObject({ Authorization: "Bearer anam-key" });
    expect(anamBody()).toMatchObject({
      personaConfig: { avatarId: "priya-avatar" },
      environment: { elevenLabsAgentSettings: { agentId: "priya-agent", signedUrl: "wss://signed", dynamicVariables: variables } },
    });
    expect(anamBody().environment.elevenLabsAgentSettings).not.toHaveProperty("conversationConfigOverride");
    expect(response.json).toHaveBeenCalledWith({ sessionToken: "token" });
  });

  it("gives a generated character its matched avatar and voice", async () => {
    resolveCallSession.mockResolvedValue({ agentId: "custom-agent", personaId: "c1", dynamicVariables: variables, voiceId: "voice-1", avatarId: "matched" });
    await requestToken();
    expect(anamBody().personaConfig.avatarId).toBe("matched");
    expect(anamBody().environment.elevenLabsAgentSettings.conversationConfigOverride).toEqual({ tts: { voiceId: "voice-1" } });
  });

  it("falls back to the shared avatar", async () => {
    resolveCallSession.mockResolvedValue({ agentId: "maya-agent", personaId: "maya", dynamicVariables: variables, voiceId: null, avatarId: null });
    await requestToken();
    expect(anamBody().personaConfig.avatarId).toBe("shared-avatar");
  });

  it("only mints tokens for owned active sessions", async () => {
    resolveCallSession.mockResolvedValue({ error: "Session not found.", status: 404 });
    const response = await requestToken();
    expect(resolveCallSession).toHaveBeenCalledWith("date", "user");
    expect(response.status).toHaveBeenCalledWith(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns the provider's error message", async () => {
    fetchMock.mockImplementation(async (url) => String(url).includes("elevenlabs")
      ? Response.json({ signed_url: "wss://signed" })
      : Response.json({ message: "Avatar not found" }, { status: 400 }));
    const response = await requestToken();
    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({ error: "Avatar not found" });
  });
});

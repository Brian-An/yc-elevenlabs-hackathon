import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getHeyGenSessionToken } from "./heygen";

const { resolveCallSession } = vi.hoisted(() => ({ resolveCallSession: vi.fn() }));
vi.mock("./sessionBrief", () => ({ resolveCallSession }));
const variables = { opening_line: "Hello", session_context: "{}", character_direction: "Practice", user_context: "None" };

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("HEYGEN_API_KEY", "test-key");
  vi.stubEnv("HEYGEN_ELEVENLABS_SECRET_ID", "test-secret");
  vi.stubEnv("HEYGEN_AVATAR_ID", "shared-avatar");
  vi.stubEnv("HEYGEN_AVATAR_ID_PRIYA", "priya-avatar");
  vi.stubEnv("ELEVENLABS_AGENT_ID_PRIYA", "current-priya-agent");
  vi.stubEnv("HEYGEN_IS_SANDBOX", "true");
  resolveCallSession.mockReset();
  resolveCallSession.mockResolvedValue({ agentId: "current-priya-agent", personaId: "priya", dynamicVariables: variables });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(Response.json({ data: { session_token: "token", session_id: "session" } }));
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
  const handler = getHeyGenSessionToken as unknown as (
    request: { query: Record<string, string>; get: (key: string) => string },
    reply: typeof response,
  ) => Promise<void>;
  await handler({ query: { sessionId: "date", agentId: "obsolete-agent", personaId: "maya" }, get: () => "user" }, response);
  return response;
}

describe("avatar connection configuration", () => {
  it("uses the supported sandbox avatar and the current persona agent for a stale page", async () => {
    await requestToken();
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      is_sandbox: true,
      avatar_id: "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a",
      elevenlabs_agent_config: { agent_id: "current-priya-agent", dynamic_variables: variables },
    });
  });

  it("only mints tokens for owned active sessions", async () => {
    resolveCallSession.mockResolvedValue({ error: "Session not found.", status: 404 });
    const response = await requestToken();
    expect(resolveCallSession).toHaveBeenCalledWith("date", "user");
    expect(response.status).toHaveBeenCalledWith(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the selected persona avatar in live mode", async () => {
    vi.stubEnv("HEYGEN_IS_SANDBOX", "false");
    await requestToken();
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).avatar_id).toBe("priya-avatar");
  });

  it("returns the provider's actionable validation error", async () => {
    fetchMock.mockResolvedValue(Response.json({ message: "Bad request error", data: [{ message: "This avatar is not supported in sandbox mode" }] }, { status: 400 }));
    const response = await requestToken();
    expect(response.status).toHaveBeenCalledWith(502);
    expect(response.json).toHaveBeenCalledWith({ error: "This avatar is not supported in sandbox mode" });
  });
});

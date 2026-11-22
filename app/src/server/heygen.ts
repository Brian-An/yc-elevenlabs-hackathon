// GET /api/heygen/session-token?agentId=...&personaId=...  -> { sessionToken, sessionId }
// personaId picks HEYGEN_AVATAR_ID_<PERSONA> (e.g. HEYGEN_AVATAR_ID_THEO) when set, falling back
// to the shared HEYGEN_AVATAR_ID.
// Proxies LiveAvatar's "create session token" so the HeyGen key stays server side.
// LiveAvatar's ElevenLabs Agent Connector talks to the ElevenLabs agent directly (no audio
// forwarding through this server or the browser): https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
//
// One-time setup before this works: register ELEVENLABS_API_KEY with HeyGen to get a secret_id.
//   curl -X POST https://api.liveavatar.com/v1/secrets -H "X-API-KEY: $HEYGEN_API_KEY" \
//     -H "content-type: application/json" \
//     -d '{"secret_type": "ELEVENLABS_API_KEY", "secret_value": "<elevenlabs_api_key>", "secret_name": "..."}'
// Put the returned id in HEYGEN_ELEVENLABS_SECRET_ID. Needs a paid ElevenLabs plan (not free tier).
import type { MiddlewareConfigFn } from "wasp/server";
import type { GetHeyGenSessionToken } from "wasp/server/api";
import { getPersona } from "./personas";

const LIVEAVATAR_API = "https://api.liveavatar.com/v1/sessions/token";
// LiveAvatar sandbox sessions support Wayne only, independently of the live persona's avatar.
const SANDBOX_AVATAR_ID = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

function providerError(body: unknown): string {
  if (!body || typeof body !== "object") return "Could not create the avatar session.";
  if ("data" in body && Array.isArray(body.data)) {
    const detail = body.data.find((entry: unknown) => entry && typeof entry === "object" && "message" in entry && typeof entry.message === "string");
    if (detail) return detail.message;
  }
  if ("message" in body && typeof body.message === "string") return body.message;
  return "Could not create the avatar session.";
}

export const heyGenEnabled = () =>
  Boolean(process.env.HEYGEN_API_KEY && process.env.HEYGEN_AVATAR_ID && process.env.HEYGEN_ELEVENLABS_SECRET_ID);

// APIs don't get Wasp's default middleware; keep the defaults (incl. CORS) for /api/heygen/*.
export const heyGenMiddleware: MiddlewareConfigFn = (config) => config;

export const getHeyGenSessionToken: GetHeyGenSessionToken<
  never,
  { sessionToken: string; sessionId: string } | { error: string }
> = async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY;
  const secretId = process.env.HEYGEN_ELEVENLABS_SECRET_ID;
  const requestedAgent = typeof req.query.agentId === "string" && req.query.agentId;
  const personaId = typeof req.query.personaId === "string" && req.query.personaId;
  // An open page can retain an agent ID after the server's persona configuration changes.
  const agentId = personaId
    ? getPersona(personaId)?.elevenLabsAgentId || process.env.ELEVENLABS_AGENT_ID || requestedAgent
    : requestedAgent || process.env.ELEVENLABS_AGENT_ID;
  const sandbox = process.env.HEYGEN_IS_SANDBOX !== "false";
  const avatarId = sandbox ? SANDBOX_AVATAR_ID :
    (personaId && process.env[`HEYGEN_AVATAR_ID_${personaId.toUpperCase()}`]) || process.env.HEYGEN_AVATAR_ID;
  if (!apiKey || !avatarId || !secretId) {
    res.status(500).json({ error: "HEYGEN_API_KEY, HEYGEN_AVATAR_ID and HEYGEN_ELEVENLABS_SECRET_ID must all be set" });
    return;
  }
  if (!agentId) {
    res.status(400).json({ error: "agentId is required" });
    return;
  }

  try {
    const upstream = await fetch(LIVEAVATAR_API, {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "LITE",
        avatar_id: avatarId,
        is_sandbox: sandbox,
        elevenlabs_agent_config: { agent_id: agentId, secret_id: secretId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await upstream.json()) as { data?: { session_token?: string; session_id?: string }; message?: string };
    if (!upstream.ok || !body.data?.session_token) {
      const message = providerError(body);
      console.error(`[heygen] session token failed ${upstream.status}: ${message}`);
      res.status(502).json({ error: message });
      return;
    }
    res.json({ sessionToken: body.data.session_token, sessionId: body.data.session_id ?? "" });
  } catch (err) {
    console.error("[heygen] session token error:", err);
    res.status(502).json({ error: "Could not reach HeyGen" });
  }
};

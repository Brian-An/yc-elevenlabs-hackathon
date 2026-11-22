// GET /api/heygen/session-token?agentId=...  -> { sessionToken, sessionId }
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

const LIVEAVATAR_API = "https://api.liveavatar.com/v1/sessions/token";

export const heyGenEnabled = () =>
  Boolean(process.env.HEYGEN_API_KEY && process.env.HEYGEN_AVATAR_ID && process.env.HEYGEN_ELEVENLABS_SECRET_ID);

// APIs don't get Wasp's default middleware; keep the defaults (incl. CORS) for /api/heygen/*.
export const heyGenMiddleware: MiddlewareConfigFn = (config) => config;

export const getHeyGenSessionToken: GetHeyGenSessionToken<
  never,
  { sessionToken: string; sessionId: string } | { error: string }
> = async (req, res) => {
  const apiKey = process.env.HEYGEN_API_KEY;
  const avatarId = process.env.HEYGEN_AVATAR_ID;
  const secretId = process.env.HEYGEN_ELEVENLABS_SECRET_ID;
  const agentId = typeof req.query.agentId === "string" && req.query.agentId;
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
        is_sandbox: process.env.HEYGEN_IS_SANDBOX !== "false",
        elevenlabs_agent_config: { agent_id: agentId, secret_id: secretId },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await upstream.json()) as { data?: { session_token?: string; session_id?: string }; message?: string };
    if (!upstream.ok || !body.data?.session_token) {
      console.error(`[heygen] session token failed ${upstream.status}: ${body.message ?? "unknown error"}`);
      res.status(502).json({ error: body.message ?? `HeyGen returned ${upstream.status}` });
      return;
    }
    res.json({ sessionToken: body.data.session_token, sessionId: body.data.session_id ?? "" });
  } catch (err) {
    console.error("[heygen] session token error:", err);
    res.status(502).json({ error: "Could not reach HeyGen" });
  }
};

// Proxies Anam's "create session token" so the Anam and ElevenLabs keys stay server side.
// Anam's engine joins the ElevenLabs agent itself through a signed URL minted here, and lip-syncs the agent's
// audio onto the avatar. No audio passes through this server: https://anam.ai/docs/integrations/elevenlabs/server-side-setup
//
// The agents need PCM 16000Hz user input audio, which scripts/elevenlabs-agents.mjs sets.
import type { MiddlewareConfigFn } from "wasp/server";
import type { GetAnamSessionToken } from "wasp/server/api";
import { fetchSignedUrl } from "./elevenlabs";
import { resolveCallSession } from "./sessionBrief";

const ANAM_API = "https://api.anam.ai/v1/auth/session-token";

export const anamEnabled = () =>
  Boolean(process.env.ANAM_API_KEY && process.env.ANAM_AVATAR_ID && process.env.ELEVENLABS_API_KEY);

function providerError(body: unknown): string {
  const fields = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const message = [fields.message, fields.error].find((value) => typeof value === "string");
  return typeof message === "string" ? message : "Could not create the avatar session.";
}

// APIs don't get Wasp's default middleware; keep the defaults (incl. CORS) for /api/anam/*.
export const anamMiddleware: MiddlewareConfigFn = (config) => config;

export const getAnamSessionToken: GetAnamSessionToken<never, { sessionToken: string } | { error: string }> = async (req, res) => {
  const apiKey = process.env.ANAM_API_KEY;
  res.set("Cache-Control", "no-store");
  try {
    const call = await resolveCallSession(req.query.sessionId, req.get("X-Bantr-User"));
    if ("error" in call) {
      res.status(call.status).json({ error: call.error });
      return;
    }
    const avatarId = call.avatarId || process.env[`ANAM_AVATAR_ID_${call.personaId.toUpperCase()}`] || process.env.ANAM_AVATAR_ID;
    if (!apiKey || !avatarId || !process.env.ELEVENLABS_API_KEY) {
      res.status(503).json({ error: "The avatar is not configured for this session." });
      return;
    }
    const upstream = await fetch(ANAM_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        clientLabel: "bantr",
        personaConfig: { avatarId },
        environment: {
          elevenLabsAgentSettings: {
            agentId: call.agentId,
            signedUrl: await fetchSignedUrl(call.agentId),
            dynamicVariables: call.dynamicVariables,
            // A generated character's matched voice. The agent allows the TTS voice override.
            ...(call.voiceId ? { conversationConfigOverride: { tts: { voiceId: call.voiceId } } } : {}),
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await upstream.json().catch(() => null)) as { sessionToken?: string } | null;
    if (!upstream.ok || !body?.sessionToken) {
      const message = providerError(body);
      console.error(`[anam] session token failed ${upstream.status}: ${message}`);
      res.status(502).json({ error: message });
      return;
    }
    res.json({ sessionToken: body.sessionToken });
  } catch (err) {
    console.error("[anam] session token error:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "Could not reach the avatar service" });
  }
};

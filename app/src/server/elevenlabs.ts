// Voice startup is bound to an active Bantr session.
// Proxies ElevenLabs Conversational AI "get signed url" so the API key stays server side.
// https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
import type { MiddlewareConfigFn } from "wasp/server";
import type { GetElevenLabsSignedUrl } from "wasp/server/api";

import { resolveCallSession, type SessionVariables } from "./sessionBrief";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

// APIs don't get Wasp's default middleware; keep the defaults (incl. CORS) for /api/elevenlabs/*.
export const elevenLabsMiddleware: MiddlewareConfigFn = (config) => config;

/** A signed URL for one conversation with the agent, which expires 15 minutes after it is minted. */
export async function fetchSignedUrl(agentId: string): Promise<string> {
  const upstream = await fetch(`${ELEVENLABS_API}?agent_id=${encodeURIComponent(agentId)}`, {
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!upstream.ok) {
    const detail = (await upstream.text()).slice(0, 300);
    console.error(`[elevenlabs] signed url failed ${upstream.status}: ${detail}`);
    throw new Error(`ElevenLabs returned ${upstream.status}`);
  }
  const body = (await upstream.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("ElevenLabs response had no signed_url");
  return body.signed_url;
}

export const getElevenLabsSignedUrl: GetElevenLabsSignedUrl<
  never,
  { signedUrl: string; dynamicVariables: SessionVariables; voiceId: string | null } | { error: string }
> = async (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!process.env.ELEVENLABS_API_KEY) {
    res.status(503).json({ error: "The voice connection is not configured." });
    return;
  }
  try {
    const call = await resolveCallSession(req.query.sessionId, req.get("X-Bantr-User"));
    if ("error" in call) {
      res.status(call.status).json({ error: call.error });
      return;
    }
    res.json({ signedUrl: await fetchSignedUrl(call.agentId), dynamicVariables: call.dynamicVariables, voiceId: call.voiceId });
  } catch (err) {
    console.error("[elevenlabs] signed url error:", err instanceof Error ? err.message : err);
    const upstream = err instanceof Error && err.message.startsWith("ElevenLabs");
    res.status(502).json({ error: upstream ? err.message : "Could not reach ElevenLabs" });
  }
};

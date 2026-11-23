// Voice startup is bound to an active Bantr session.
// Proxies ElevenLabs Conversational AI "get signed url" so the API key stays server side.
// https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
import type { MiddlewareConfigFn } from "wasp/server";
import type { GetElevenLabsSignedUrl } from "wasp/server/api";

import { resolveCallSession, type SessionVariables } from "./sessionBrief";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

// APIs don't get Wasp's default middleware; keep the defaults (incl. CORS) for /api/elevenlabs/*.
export const elevenLabsMiddleware: MiddlewareConfigFn = (config) => config;

export const getElevenLabsSignedUrl: GetElevenLabsSignedUrl<
  never,
  { signedUrl: string; dynamicVariables: SessionVariables } | { error: string }
> = async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  res.set("Cache-Control", "no-store");
  if (!apiKey) {
    res.status(503).json({ error: "The voice connection is not configured." });
    return;
  }
  try {
    const call = await resolveCallSession(req.query.sessionId, req.get("X-Bantr-User"));
    if ("error" in call) {
      res.status(call.status).json({ error: call.error });
      return;
    }
    const url = `${ELEVENLABS_API}?agent_id=${encodeURIComponent(call.agentId)}`;
    const upstream = await fetch(url, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      console.error(`[elevenlabs] signed url failed ${upstream.status}: ${detail}`);
      res.status(502).json({ error: `ElevenLabs returned ${upstream.status}` });
      return;
    }
    const body = (await upstream.json()) as { signed_url?: string };
    if (!body.signed_url) {
      res.status(502).json({ error: "ElevenLabs response had no signed_url" });
      return;
    }
    res.json({ signedUrl: body.signed_url, dynamicVariables: call.dynamicVariables });
  } catch (err) {
    console.error("[elevenlabs] signed url error:", err);
    res.status(502).json({ error: "Could not reach ElevenLabs" });
  }
};

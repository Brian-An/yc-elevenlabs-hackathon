// GET /api/elevenlabs/signed-url?agentId=...  -> { signedUrl }
// Proxies ElevenLabs Conversational AI "get signed url" so the API key stays server side.
// https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
import type { MiddlewareConfigFn } from "wasp/server";
import type { GetElevenLabsSignedUrl } from "wasp/server/api";

const ELEVENLABS_API = "https://api.elevenlabs.io/v1/convai/conversation/get-signed-url";

// APIs don't get Wasp's default middleware; keep the defaults (incl. CORS) for /api/elevenlabs/*.
export const elevenLabsMiddleware: MiddlewareConfigFn = (config) => config;

export const getElevenLabsSignedUrl: GetElevenLabsSignedUrl<
  never,
  { signedUrl: string } | { error: string }
> = async (req, res) => {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const agentId =
    (typeof req.query.agentId === "string" && req.query.agentId) || process.env.ELEVENLABS_AGENT_ID;
  if (!apiKey) {
    res.status(500).json({ error: "ELEVENLABS_API_KEY is not set" });
    return;
  }
  if (!agentId) {
    res.status(400).json({ error: "agentId is required (or set ELEVENLABS_AGENT_ID)" });
    return;
  }

  try {
    const url = `${ELEVENLABS_API}?agent_id=${encodeURIComponent(agentId)}`;
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
    res.json({ signedUrl: body.signed_url });
  } catch (err) {
    console.error("[elevenlabs] signed url error:", err);
    res.status(502).json({ error: "Could not reach ElevenLabs" });
  }
};

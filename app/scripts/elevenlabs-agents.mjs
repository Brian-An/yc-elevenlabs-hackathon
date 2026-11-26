// Creates or updates Bantr's hosted ElevenLabs agents from this file and the session prompt template, so the
// dashboard never drifts from the code. New agent IDs are written to .env.server.
//
//   node scripts/elevenlabs-agents.mjs            create missing agents, update the rest
//   node scripts/elevenlabs-agents.mjs --dry-run  print the request bodies without calling ElevenLabs
//
// https://elevenlabs.io/docs/api-reference/agents/create
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";

const API = "https://api.elevenlabs.io/v1/convai/agents";
const ROOT = new URL("..", import.meta.url).pathname;
const ENV_FILE = `${ROOT}.env.server`;
const TEMPLATE = readFileSync(`${ROOT}prompts/elevenlabs/session-v2.md`, "utf8");
const dryRun = process.argv.includes("--dry-run");

// claude-haiku-4-5 keeps replies fast enough for a spoken conversation. Temperature above the default gives
// the variety a person has; the template's style rules keep it on track.
const LLM = { llm: "claude-haiku-4-5", temperature: 0.8 };
// eleven_v4_turbo with expressive mode performs the template's tone tags such as [laughs].
const TTS = { model_id: "eleven_v4_turbo", expressive_mode: true, similarity_boost: 0.75, optimize_streaming_latency: 3 };
const AUDIO_TAGS = [
  { tag: "laughs", description: "a real laugh at something funny" },
  { tag: "chuckles", description: "a short, quiet laugh" },
  { tag: "sighs", description: "tired, wistful or mock-exasperated" },
  { tag: "exhales", description: "relief or letting something go" },
  { tag: "hesitates", description: "unsure, choosing words" },
];

/**
 * One agent per stock persona, plus a shared agent for generated characters, which also serves as the default.
 * Turn eagerness and the soft-timeout filler follow each character's pace; stability below the default 0.5
 * gives a more varied delivery.
 */
const AGENTS = [
  { env: "ELEVENLABS_AGENT_ID_MAYA", name: "Bantr - Maya", voice: "cgSgspJ2msm6clMCkdW9", eagerness: "patient", stability: 0.4, speed: 1.0, filler: "Hmm, okay..." },
  { env: "ELEVENLABS_AGENT_ID_THEO", name: "Bantr - Theo", voice: "bIHbv24MWmeRgasZH58o", eagerness: "normal", stability: 0.45, speed: 0.95, filler: "Huh." },
  { env: "ELEVENLABS_AGENT_ID_PRIYA", name: "Bantr - Priya", voice: "EXAVITQu4vr4xnSDxMaL", eagerness: "eager", stability: 0.4, speed: 1.05, filler: "Mm." },
  { env: "ELEVENLABS_AGENT_ID_COACH", name: "Bantr - Riley (coach)", voice: "SAz9YHcvj6GT2YYXdXww", eagerness: "patient", stability: 0.5, speed: 1.0, filler: "Mm, let me think." },
  { env: "ELEVENLABS_AGENT_ID_CUSTOM", name: "Bantr - Generated characters", voice: "SAz9YHcvj6GT2YYXdXww", eagerness: "normal", stability: 0.4, speed: 1.0, filler: "Hmm." },
];
const DEFAULT_AGENT_ENV = "ELEVENLABS_AGENT_ID_CUSTOM";

function agentBody(agent) {
  return {
    name: agent.name,
    tags: ["bantr"],
    conversation_config: {
      agent: {
        first_message: "{{opening_line}}",
        language: "en",
        prompt: { prompt: TEMPLATE, ...LLM },
        // Placeholders let the dashboard's test call run. Real sessions always send all three.
        dynamic_variables: {
          dynamic_variable_placeholders: {
            character_direction: "You are Sam, 28, a librarian who climbs on weekends.",
            session_context: "{\"setting\":\"A quiet café\",\"difficulty\":\"easy\"}",
            opening_line: "Hey! You made it.",
          },
        },
      },
      // Anam's avatar engine sends the user's audio as 16kHz PCM.
      asr: { user_input_audio_format: "pcm_16000" },
      tts: { ...TTS, voice_id: agent.voice, stability: agent.stability, speed: agent.speed, suggested_audio_tags: AUDIO_TAGS },
      turn: {
        turn_eagerness: agent.eagerness,
        // Spoken when the LLM is slow to answer, so a pause sounds like thinking instead of a dropped call.
        soft_timeout_config: { timeout_seconds: 3, message: agent.filler, use_llm_generated_message: false },
      },
      conversation: { max_duration_seconds: 600 },
    },
    // Generated characters bring their matched voice as a per-session override.
    platform_settings: { overrides: { conversation_config_override: { tts: { voice_id: true } } } },
  };
}

function readEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(readFileSync(file, "utf8").split("\n")
    .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter((match) => match?.[2].trim())
    .map(([, key, value]) => [key, value.trim()]));
}

function setEnv(key, value) {
  const text = readFileSync(ENV_FILE, "utf8");
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  writeFileSync(ENV_FILE, pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`);
}

async function call(method, url, apiKey, body) {
  const response = await fetch(url, {
    method,
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${method} ${url} returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}

if (dryRun) {
  for (const agent of AGENTS) console.log(agent.env, JSON.stringify(agentBody(agent), null, 2));
  process.exit(0);
}

if (!existsSync(ENV_FILE)) {
  copyFileSync(`${ROOT}.env.server.example`, ENV_FILE);
  console.log("Created .env.server from .env.server.example");
}
const env = { ...readEnv(`${ROOT}.env.local`), ...readEnv(ENV_FILE), ...process.env };
const apiKey = env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("Set ELEVENLABS_API_KEY in .env.server or the environment");
if (!readEnv(ENV_FILE).ELEVENLABS_API_KEY) setEnv("ELEVENLABS_API_KEY", apiKey);

for (const agent of AGENTS) {
  const id = env[agent.env];
  if (id) {
    await call("PATCH", `${API}/${id}`, apiKey, agentBody(agent));
    console.log(`Updated ${agent.name} (${id})`);
  } else {
    const { agent_id } = await call("POST", `${API}/create`, apiKey, agentBody(agent));
    env[agent.env] = agent_id;
    setEnv(agent.env, agent_id);
    console.log(`Created ${agent.name} (${agent_id})`);
  }
}
setEnv("ELEVENLABS_AGENT_ID", env[DEFAULT_AGENT_ENV]);
console.log(`ELEVENLABS_AGENT_ID now points at ${env[DEFAULT_AGENT_ENV]}`);

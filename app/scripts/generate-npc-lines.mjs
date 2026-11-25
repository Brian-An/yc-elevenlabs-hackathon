// Generates the passers-by's voice lines with ElevenLabs text to speech and saves them to public/audio/npc.
// Each passer-by gets a voice from the account, ranked the same way generated characters' voices are. They never
// get a voice a date persona or the coach speaks with, and two passers-by share one only when the account runs out.
//
//   node scripts/generate-npc-lines.mjs           # new lines, and lines whose passer-by got a different voice
//   node scripts/generate-npc-lines.mjs --force   # every line, e.g. after rewording
//
// Reads ELEVENLABS_API_KEY, the ELEVENLABS_AGENT_ID_* agents and DATABASE_URL from the environment or .env.server.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { NPC_LINES, npcLineUrl } from "../src/world/npcLines.ts";
import { accountVoices, rankVoices } from "../src/server/voices.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const MODEL = "eleven_multilingual_v2";
const manifestFile = join(root, "public/audio/npc/voices.json");

const envFile = join(root, ".env.server");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("Set ELEVENLABS_API_KEY (or add it to .env.server) to generate the lines.");

/** Voices the stock personas' agents speak with, and the voices generated characters were given. */
async function personaVoices() {
  const ids = new Set();
  const agents = Object.entries(process.env).filter(([key, value]) => key.startsWith("ELEVENLABS_AGENT_ID") && value);
  for (const [key, agentId] of agents) {
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, { headers: { "xi-api-key": apiKey } });
    if (!response.ok) throw new Error(`Couldn't read agent ${key}: ${response.status}`);
    const voiceId = (await response.json()).conversation_config?.tts?.voice_id;
    if (voiceId) ids.add(voiceId);
  }
  if (process.env.DATABASE_URL) {
    const prisma = new PrismaClient();
    try {
      const rows = await prisma.customPersona.findMany({ where: { voiceId: { not: null } }, select: { voiceId: true } });
      for (const row of rows) ids.add(row.voiceId);
    } finally {
      await prisma.$disconnect();
    }
  }
  return ids;
}

const voices = await accountVoices();
if (voices.length === 0) throw new Error("No ElevenLabs voices found in the account.");
const taken = await personaVoices();
const previous = existsSync(manifestFile) ? JSON.parse(readFileSync(manifestFile, "utf8")) : {};
const manifest = {};

const free = voices.filter((v) => !taken.has(v.voiceId));
const npcUsed = new Set();
let generated = 0;
for (const [extra, { voice: target, lines }] of NPC_LINES.entries()) {
  const voice = rankVoices(free, target, npcUsed)[0];
  if (!voice) throw new Error(`No voice that no persona uses fits passer-by ${extra}.`);
  npcUsed.add(voice.voiceId);
  manifest[extra] = { voiceId: voice.voiceId, name: voice.name };
  const changedVoice = previous[extra]?.voiceId !== voice.voiceId;
  console.log(`Passer-by ${extra}: ${voice.name}${changedVoice && previous[extra] ? ` (was ${previous[extra].name})` : ""}`);
  for (const [line, text] of lines.entries()) {
    const file = join(root, "public", npcLineUrl(extra, line));
    if (existsSync(file) && !force && !changedVoice) continue;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice.voiceId}?output_format=mp3_44100_64`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: MODEL }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Text to speech failed for "${text}": ${response.status} ${await response.text()}`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(await response.arrayBuffer()));
    generated++;
    console.log(`  ${npcLineUrl(extra, line)}  "${text}"`);
  }
}
writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(generated ? `Generated ${generated} clips.` : "Every line already has a clip in the right voice. Pass --force to regenerate.");

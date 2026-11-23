// Matches generated characters to LiveAvatar video avatars. LiveAvatar lists avatars with only a name and a
// preview image, so a background job describes each preview once with Claude's vision and stores it.
// https://docs.liveavatar.com/api-reference/avatar/list-public-avatars
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { prisma } from "wasp/server";
import { refreshAvatarCatalog as catalogQueue, type RefreshAvatarCatalog } from "wasp/server/jobs";
import { z } from "zod";
import { anthropic, anthropicEnabled, assertFinished, characterModel, FALLBACK_BETA } from "./anthropic";

const LIVEAVATAR_API = "https://api.liveavatar.com/v1";
const TAG_BATCH = 100;
const TAG_CONCURRENCY = 3;
const RETRY_FAILED_MS = 24 * 60 * 60_000;

/** Avatars are matched only for real sessions: sandbox sessions support a single fixed avatar. */
export const avatarMatchingEnabled = () =>
  Boolean(process.env.HEYGEN_API_KEY && process.env.HEYGEN_IS_SANDBOX === "false" && anthropicEnabled());

const avatarSchema = z.object({
  id: z.string(),
  name: z.string(),
  preview_url: z.string().nullish(),
  status: z.string().optional(),
  is_expired: z.boolean().optional(),
});
const pageSchema = z.object({ data: z.object({ results: z.array(avatarSchema), next: z.string().nullish() }) });

async function listAvatars(path: "avatars/public" | "avatars"): Promise<z.infer<typeof avatarSchema>[]> {
  const apiKey = process.env.HEYGEN_API_KEY!;
  const avatars: z.infer<typeof avatarSchema>[] = [];
  for (let page = 1; page <= 5; page++) {
    const response = await fetch(`${LIVEAVATAR_API}/${path}?page=${page}&page_size=100`, {
      headers: { "X-API-KEY": apiKey }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`LiveAvatar ${path} returned ${response.status}`);
    const body = pageSchema.parse(await response.json());
    avatars.push(...body.data.results);
    if (!body.data.next) break;
  }
  return avatars;
}

const tagSchema = z.object({
  gender: z.enum(["woman", "man", "unclear"]),
  ageRange: z.enum(["20s", "30s", "40s", "50s+", "unclear"]),
  description: z.string().describe("One sentence on visible appearance: hair, apparent skin tone, build, clothing, setting."),
});

async function describePreview(previewUrl: string) {
  const message = await anthropic().beta.messages.parse({
    model: characterModel(),
    max_tokens: 2000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(tagSchema) },
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "url", url: previewUrl } },
        { type: "text", text: "This is a stock avatar for a video character. Describe only what is visible, for matching it to a fictional character's description. Do not guess identity, name, or nationality." },
      ],
    }],
  });
  assertFinished(message);
  if (!message.parsed_output) throw new Error("No avatar description");
  return message.parsed_output;
}

async function inBatches<T>(items: T[], size: number, run: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(run));
}

/** Syncs the avatar list and describes up to TAG_BATCH untagged avatars. Safe to run concurrently. */
export async function syncAvatarCatalog(): Promise<{ listed: number; tagged: number }> {
  if (!avatarMatchingEnabled()) return { listed: 0, tagged: 0 };
  const listed = [...await listAvatars("avatars"), ...await listAvatars("avatars/public")]
    .filter((avatar) => avatar.preview_url && (avatar.status ?? "ACTIVE") === "ACTIVE" && !avatar.is_expired);
  for (const avatar of listed) {
    await prisma.avatarProfile.upsert({
      where: { avatarId: avatar.id },
      create: { avatarId: avatar.id, name: avatar.name, previewUrl: avatar.preview_url! },
      update: { name: avatar.name, previewUrl: avatar.preview_url! },
    });
  }
  const pending = await prisma.avatarProfile.findMany({
    where: { taggedAt: null, OR: [{ failedAt: null }, { failedAt: { lt: new Date(Date.now() - RETRY_FAILED_MS) } }] },
    take: TAG_BATCH,
  });
  let tagged = 0;
  await inBatches(pending, TAG_CONCURRENCY, async (avatar) => {
    try {
      const tag = await describePreview(avatar.previewUrl);
      await prisma.avatarProfile.update({ where: { avatarId: avatar.avatarId }, data: { ...tag, taggedAt: new Date(), failedAt: null } });
      tagged++;
    } catch (error) {
      console.error("[avatars] tagging failed", avatar.avatarId, error instanceof Error ? error.name : "unknown");
      await prisma.avatarProfile.update({ where: { avatarId: avatar.avatarId }, data: { failedAt: new Date() } });
    }
  });
  return { listed: listed.length, tagged };
}

export const refreshAvatarCatalog: RefreshAvatarCatalog<never, void> = async () => {
  const result = await syncAvatarCatalog();
  console.info(JSON.stringify({ event: "avatar_catalog_sync", ...result }));
};

/** Starts a catalog sync in the background, for when a character is generated before any avatar is described. */
export async function requestAvatarCatalogSync(): Promise<void> {
  try {
    await catalogQueue.submit({});
  } catch (error) {
    console.error("[avatars] sync request failed", error instanceof Error ? error.name : "unknown");
  }
}

/**
 * Picks the described avatar that best fits a character's appearance, or null when matching is off or nothing
 * fits the character's gender. Claude chooses among the candidates, so it can weigh appearance as a whole.
 */
export async function matchAvatar(character: { gender: "woman" | "man" | "nonbinary"; age: number; appearance: string }): Promise<string | null> {
  if (!avatarMatchingEnabled()) return null;
  const tagged = await prisma.avatarProfile.findMany({ where: { taggedAt: { not: null } }, orderBy: { avatarId: "asc" } });
  if (!tagged.length) {
    await requestAvatarCatalogSync();
    return null;
  }
  const candidates = tagged.filter((avatar) => character.gender === "nonbinary" || avatar.gender === character.gender || avatar.gender === "unclear");
  if (!candidates.length) return null;
  const ids = candidates.map((avatar) => avatar.avatarId) as [string, ...string[]];
  const message = await anthropic().beta.messages.parse({
    model: characterModel(),
    max_tokens: 2000,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(z.object({ avatarId: z.enum(ids) })) },
    messages: [{
      role: "user",
      content: `Choose the avatar whose appearance best matches this fictional character.\n\n${JSON.stringify({
        character: { gender: character.gender, age: character.age, appearance: character.appearance },
        avatars: candidates.map(({ avatarId, gender, ageRange, description }) => ({ avatarId, gender, ageRange, description })),
      })}`,
    }],
  });
  assertFinished(message);
  return message.parsed_output?.avatarId ?? null;
}

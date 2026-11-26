// Matches generated characters to Anam video avatars. Anam lists avatars with a name and a preview image but
// no structured appearance, so a background job describes each preview once with Claude's vision and stores it.
// https://anam.ai/docs/api-reference/avatars/list-avatars
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { prisma } from "wasp/server";
import { refreshAvatarCatalog as catalogQueue, type RefreshAvatarCatalog } from "wasp/server/jobs";
import { z } from "zod";
import { anthropic, anthropicEnabled, assertFinished, characterModel, FALLBACK_BETA } from "./anthropic";

const ANAM_API = "https://api.anam.ai/v1/avatars";
const MAX_PAGES = 10;
const TAG_BATCH = 100;
const TAG_CONCURRENCY = 3;
const RETRY_FAILED_MS = 24 * 60 * 60_000;

export const avatarMatchingEnabled = () => Boolean(process.env.ANAM_API_KEY && anthropicEnabled());

const avatarSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  variantName: z.string().nullish(),
  // A signed link that stays valid for at least an hour. The catalog sync refreshes it.
  imageUrl: z.string().nullish(),
});
const pageSchema = z.object({
  data: z.array(avatarSchema),
  meta: z.object({ currentPage: z.number(), lastPage: z.number() }),
});

/** Every realistic avatar the account can use: Anam's stock avatars and the account's own. */
async function listAvatars(): Promise<z.infer<typeof avatarSchema>[]> {
  const avatars: z.infer<typeof avatarSchema>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await fetch(`${ANAM_API}?page=${page}&perPage=100&renderStyle=realistic`, {
      headers: { Authorization: `Bearer ${process.env.ANAM_API_KEY}` }, signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Anam avatars returned ${response.status}`);
    const body = pageSchema.parse(await response.json());
    avatars.push(...body.data);
    if (body.meta.currentPage >= body.meta.lastPage) break;
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
  const listed = (await listAvatars()).filter((avatar) => avatar.imageUrl);
  for (const avatar of listed) {
    const name = avatar.variantName ? `${avatar.displayName} (${avatar.variantName})` : avatar.displayName;
    await prisma.avatarProfile.upsert({
      where: { avatarId: avatar.id },
      create: { avatarId: avatar.id, name, previewUrl: avatar.imageUrl! },
      update: { name, previewUrl: avatar.imageUrl! },
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

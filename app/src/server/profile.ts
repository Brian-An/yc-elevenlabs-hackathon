import { HttpError } from "wasp/server";
import type { GetMemory, GetProfile, UpdateProfile } from "wasp/server/operations";
import type { MemorySnapshot, Preferences, Profile, UpdateProfileArgs } from "./dto";
import { getMemory as loadMemory } from "./memory";
import { asJson, readJson } from "./serialize";

export const getProfile: GetProfile<void, Profile> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  const user = await context.entities.User.findUniqueOrThrow({ where: { id: context.user.id } });
  return {
    id: user.id,
    username: context.user.identities.username?.id ?? null,
    displayName: user.displayName,
    goals: user.goals,
    experienceLevel: user.experienceLevel,
    preferences: readJson<Preferences>(user.preferences, {}),
    onboardedAt: user.onboardedAt,
    memory: await loadMemory(user.id),
  };
};

export const updateProfile: UpdateProfile<UpdateProfileArgs, Profile> = async (args, context) => {
  if (!context.user) throw new HttpError(401);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : undefined);
  await context.entities.User.update({
    where: { id: context.user.id },
    data: {
      displayName: str(args?.displayName),
      goals: str(args?.goals),
      experienceLevel: str(args?.experienceLevel),
      ...(args?.preferences !== undefined ? { preferences: asJson(args.preferences ?? {}) } : {}),
      onboardedAt: context.user.onboardedAt ?? new Date(),
    },
  });
  return getProfile(undefined, context as Parameters<typeof getProfile>[1]);
};

export const getMemory: GetMemory<void, MemorySnapshot> = async (_args, context) => {
  if (!context.user) throw new HttpError(401);
  return loadMemory(context.user.id);
};

import type { GetMemory, GetProfile, UpdateProfile } from "wasp/server/operations";
import type { MemorySnapshot, Preferences, Profile, UpdateProfileArgs } from "./dto";
import { getMemory as loadMemory } from "./memory";
import { asJson, readJson } from "./serialize";
import { ensureUser, userIdFrom, type WithUser } from "./user";

/** A user who has never saved anything gets an empty profile (onboardedAt: null). */
export const getProfile: GetProfile<WithUser, Profile> = async (args, context) => {
  const userId = userIdFrom(args);
  const user = await context.entities.User.findUnique({ where: { id: userId } });
  return {
    id: userId,
    displayName: user?.displayName ?? null,
    goals: user?.goals ?? null,
    experienceLevel: user?.experienceLevel ?? null,
    preferences: readJson<Preferences>(user?.preferences, {}),
    onboardedAt: user?.onboardedAt ?? null,
    memory: await loadMemory(userId),
  };
};

export const updateProfile: UpdateProfile<UpdateProfileArgs, Profile> = async (args, context) => {
  const userId = await ensureUser(args);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() || null : undefined);
  const current = await context.entities.User.findUniqueOrThrow({ where: { id: userId } });
  await context.entities.User.update({
    where: { id: userId },
    data: {
      displayName: str(args.displayName),
      goals: str(args.goals),
      experienceLevel: str(args.experienceLevel),
      ...(args.preferences !== undefined ? { preferences: asJson(args.preferences ?? {}) } : {}),
      onboardedAt: current.onboardedAt ?? new Date(),
    },
  });
  return getProfile({ userId }, context as Parameters<typeof getProfile>[1]);
};

export const getMemory: GetMemory<WithUser, MemorySnapshot> = async (args) => loadMemory(userIdFrom(args));

// Identifies the caller from the browser-generated `userId` in operation args.
// There is no login, so the ID is trusted as-is. Good enough for a hackathon demo.
import { HttpError, prisma } from "wasp/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type WithUser = { userId: string };

/** Returns the caller's user ID, or throws 400 if it is missing or malformed. */
export function userIdFrom(args: unknown): string {
  const id = (args as Partial<WithUser> | null | undefined)?.userId;
  if (typeof id !== "string" || !UUID.test(id)) throw new HttpError(400, "userId (a UUID) is required");
  return id;
}

/** Like userIdFrom, but also creates the User row on first use. Use it before writing rows that reference the user. */
export async function ensureUser(args: unknown): Promise<string> {
  const id = userIdFrom(args);
  await prisma.user.upsert({ where: { id }, create: { id }, update: {} });
  return id;
}

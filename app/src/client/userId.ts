// There is no login. Each browser gets a random user ID, kept in localStorage,
// and every operation receives it as `userId` in its args:
//   useQuery(getProfile, { userId: getUserId() })
//   await createDateSession({ userId: getUserId(), personaId })
const KEY = "bantr:userId";

let cached: string | null = null;

export function getUserId(): string {
  if (cached) return cached;
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
  }
  cached = id;
  return id;
}

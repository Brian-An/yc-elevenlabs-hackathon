/** Reads the server's actionable error without exposing the request URL or stack trace. */
export async function requestErrorMessage(error: unknown, fallback: string): Promise<string> {
  if (error && typeof error === "object" && "response" in error && error.response instanceof Response) {
    try {
      const body: unknown = await error.response.clone().json();
      if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
    } catch {
      return fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}

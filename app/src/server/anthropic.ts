// The Anthropic SDK client for character generation and avatar tagging.
// It reads ANTHROPIC_API_KEY and ANTHROPIC_BASE_URL from the environment.
import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";

let client: Anthropic | null = null;

export const anthropicEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY?.trim());

export function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export const characterModel = () => process.env.ANTHROPIC_CHARACTER_MODEL?.trim() || "claude-opus-5-5";

/** Server-side fallbacks re-run a declined request on another model inside the same call. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/** A failure the caller can show to the user without leaking provider details. */
export class GenerationError extends Error {
  override name = "GenerationError";
}

/** Rejects a response that did not finish, so a truncated or refused answer is never parsed as a result. */
export function assertFinished(message: Pick<BetaMessage, "stop_reason">): void {
  if (message.stop_reason === "refusal") throw new GenerationError("The request was declined. Try describing the character differently.");
  if (message.stop_reason !== "end_turn") throw new GenerationError("The character could not be generated. Try again.");
}

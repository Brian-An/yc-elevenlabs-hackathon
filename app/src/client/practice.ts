import { useState } from "react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { api, handleApiError } from "wasp/client/api";
import { createDateSession, queryClientInitialized } from "wasp/client/operations";
import { deserialize, serialize } from "wasp/core/serialization";
import type { GenerateCustomPersonaArgs } from "../server/customPersonas";
import type { PersonaWithScenario } from "../server/dto";
import type { Difficulty } from "../shared/types";
import { getUserId } from "./userId";

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string }[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

/** The difficulty that suits how much someone has dated: newcomers start easy. */
export function difficultyFor(experience: string | null | undefined): Difficulty {
  if (experience === "beginner") return "easy";
  if (experience === "experienced") return "hard";
  return "medium";
}

export const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

/** Starts a date with a character and opens the call. */
export function useStartDate() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function start(personaId: string) {
    setStarting(personaId);
    setError(null);
    try {
      const session = await createDateSession({ userId: getUserId(), personaId });
      navigate(routes.DateRoute.build({ params: { sessionId: session.id } }));
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the date. Try again."));
      setStarting(null);
    }
  }
  return { start, starting, error };
}

/** Writing a character takes a Claude call plus voice and avatar lookups, often 20s or more. */
const GENERATE_TIMEOUT_MS = 120_000;

/**
 * Calls the generateCustomPersona action with a longer timeout. Wasp's own action client gives up after ky's
 * default 10s, which left the character saved on the server while the page reported a failure.
 */
async function generateCustomPersona(args: GenerateCustomPersonaArgs): Promise<PersonaWithScenario> {
  try {
    const json = await api.post("/operations/generate-custom-persona", { json: serialize(args), timeout: GENERATE_TIMEOUT_MS }).json();
    return deserialize(json as Parameters<typeof deserialize>[0]) as PersonaWithScenario;
  } catch (error) {
    throw handleApiError(error);
  } finally {
    // A Wasp action refetches the queries that read the entities it changed; do the same for the new character,
    // without making the caller wait for those refetches.
    void queryClientInitialized.then((queryClient) => queryClient.invalidateQueries());
  }
}

/** Generates a character and tracks whether one is being written. */
export function useGenerateCharacter() {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(args: Omit<GenerateCustomPersonaArgs, "userId">): Promise<PersonaWithScenario | null> {
    if (generating) return null;
    setGenerating(true);
    setError(null);
    try {
      return await generateCustomPersona({ userId: getUserId(), ...args });
    } catch (err) {
      setError(errorMessage(err, "The character could not be created. Try again."));
      return null;
    } finally {
      setGenerating(false);
    }
  }

  return { generate, generating, error, clearError: () => setError(null) };
}

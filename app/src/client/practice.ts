import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { createDateSession, generateCustomPersona } from "wasp/client/operations";
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

/** Generates a character, counting the seconds it takes so the wait reads as progress. */
export function useGenerateCharacter() {
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

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

  return { generate, generating, elapsed, error, clearError: () => setError(null) };
}

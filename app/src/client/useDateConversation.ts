/**
 * The voice conversation for a date. THIS IS WHERE ELEVENLABS PLUGS IN.
 *
 * The page only uses what this hook returns (status, isSpeaking, isMuted, transcript, elapsedMs, start, end, toggleMute),
 * so the real implementation can replace the mock body without touching the UI.
 *
 * Real implementation sketch with @elevenlabs/react:
 *
 *   const conversation = useConversation({
 *     onConnect: () => setStatus("live"),
 *     onDisconnect: () => setStatus("ended"),
 *     onMessage: ({ message, source }) =>
 *       append({ speaker: source === "user" ? "user" : "agent", text: message, timestamp: Date.now() - startedAt }),
 *     onError: (e) => setError(String(e)),
 *   });
 *   start   -> await navigator.mediaDevices.getUserMedia({ audio: true });
 *              await conversation.startSession({ agentId: persona.elevenLabsAgentId, connectionType: "webrtc",
 *                overrides: { agent: { firstMessage: scenario.openingLine } } })
 *              (or, so the API key stays server-side: fetch GET /api/elevenlabs/signed-url?agentId=... from the backend
 *               and call startSession({ signedUrl }))
 *   end     -> await conversation.endSession()
 *   mute    -> conversation.setMicMuted?.(next)  (or the `micMuted` option, depending on SDK version)
 *   isSpeaking -> conversation.isSpeaking
 *
 * Until then, the mock below replays a sample transcript so the UI can be built and demoed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Persona, Scenario, Transcript, TranscriptTurn } from "../shared/types";

export type ConversationStatus = "idle" | "connecting" | "live" | "ended";

export type DateConversation = {
  status: ConversationStatus;
  /** The persona is talking right now (drives the avatar's speaking state). */
  isSpeaking: boolean;
  isMuted: boolean;
  transcript: Transcript;
  elapsedMs: number;
  error: string | null;
  start: () => Promise<void>;
  /** Ends the call and resolves with the final transcript (to send to the evaluator). */
  end: () => Promise<Transcript>;
  toggleMute: () => void;
};

export function useDateConversation({
  persona,
  scenario,
  sampleTranscript = [],
}: {
  persona: Persona;
  scenario: Scenario;
  /** Mock only: turns to replay after start. */
  sampleTranscript?: Transcript;
}): DateConversation {
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<Transcript>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error] = useState<string | null>(null);

  const startedAt = useRef(0);
  const timers = useRef<number[]>([]);
  const transcriptRef = useRef<Transcript>([]);

  const append = useCallback((turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
  }, []);

  // Call timer
  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt.current), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const start = useCallback(async () => {
    // --- MOCK: replace with ElevenLabs startSession (see header) ---
    void persona;
    setStatus("connecting");
    await new Promise((r) => setTimeout(r, 700));
    startedAt.current = Date.now();
    transcriptRef.current = [];
    setTranscript([]);
    setElapsedMs(0);
    setStatus("live");

    const turns = sampleTranscript.length
      ? sampleTranscript
      : [{ speaker: "agent" as const, text: scenario.openingLine ?? "Hey! Nice to finally meet you.", timestamp: 0 }];
    turns.forEach((turn) => {
      const speakFor = Math.min(2600, 600 + turn.text.length * 35);
      if (turn.speaker === "agent") {
        timers.current.push(window.setTimeout(() => setIsSpeaking(true), turn.timestamp + 300));
        timers.current.push(window.setTimeout(() => setIsSpeaking(false), turn.timestamp + 300 + speakFor));
      }
      timers.current.push(window.setTimeout(() => append(turn), turn.timestamp + 300 + (turn.speaker === "agent" ? 200 : speakFor)));
    });
    // --- END MOCK ---
  }, [append, persona, sampleTranscript, scenario.openingLine]);

  const end = useCallback(async () => {
    // --- MOCK: replace with conversation.endSession() ---
    clearTimers();
    setIsSpeaking(false);
    setStatus("ended");
    return transcriptRef.current;
  }, []);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  return { status, isSpeaking, isMuted, transcript, elapsedMs, error, start, end, toggleMute };
}

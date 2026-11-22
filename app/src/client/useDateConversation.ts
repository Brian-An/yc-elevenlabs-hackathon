/**
 * The voice conversation for a date. Wraps ElevenLabs' `useConversation` (from
 * `@elevenlabs/react`) behind the same interface the mock used to expose, so
 * DatePage.tsx doesn't need to know it's talking to a real agent now.
 *
 * The caller (DatePage.tsx) must render this inside an ElevenLabs
 * `ConversationProvider`, since `useConversation` requires one.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useConversation } from "@elevenlabs/react";
import { api } from "wasp/client/api";
import type { Persona, Scenario, Transcript, TranscriptTurn } from "../shared/types";

export type ConversationStatus = "idle" | "connecting" | "live" | "paused" | "ended";

export type DateConversation = {
  status: ConversationStatus;
  /** The persona is talking right now (drives the avatar's speaking state). */
  isSpeaking: boolean;
  isMuted: boolean;
  /**
   * The persona's avatar video, once a video avatar provider (e.g. HeyGen LiveAvatar) is wired in.
   * null shows the persona's static photo instead. From a LiveKit/WebRTC track: new MediaStream([track.mediaStreamTrack]).
   */
  videoStream: MediaStream | null;
  transcript: Transcript;
  elapsedMs: number;
  error: string | null;
  start: () => Promise<void>;
  /** Ends the call and resolves with the final transcript (to send to the evaluator). */
  end: () => Promise<Transcript>;
  /** Holds the date: no mic, no agent audio, timer stopped. */
  pause: () => void;
  resume: () => void;
  toggleMute: () => void;
};

export function useDateConversation({ persona, scenario }: { persona: Persona; scenario: Scenario }): DateConversation {
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [transcript, setTranscript] = useState<Transcript>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoStream] = useState<MediaStream | null>(null); // no avatar video provider wired in yet

  // elapsedMs = time live so far; `liveSince` is when the current live stretch began.
  const elapsedBefore = useRef(0);
  const liveSince = useRef(0);
  const startedAt = useRef(0);
  const transcriptRef = useRef<Transcript>([]);
  const wasMutedBeforePause = useRef(false);

  const append = useCallback((turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
  }, []);

  const conversation = useConversation({
    onConnect: () => setStatus("live"),
    onDisconnect: () => setStatus((s) => (s === "paused" ? s : "ended")),
    onMessage: ({ message, role }) => {
      if (status === "paused") return;
      append({ speaker: role === "user" ? "user" : "agent", text: message, timestamp: Date.now() - startedAt.current });
    },
    onError: (message) => setError(message),
  });

  const elapsedNow = () => elapsedBefore.current + (Date.now() - liveSince.current);

  // Call timer
  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(elapsedNow()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    transcriptRef.current = [];
    setTranscript([]);
    elapsedBefore.current = 0;
    setElapsedMs(0);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const searchParams = persona.elevenLabsAgentId ? { agentId: persona.elevenLabsAgentId } : undefined;
      const body = await api
        .get("api/elevenlabs/signed-url", { searchParams })
        .json<{ signedUrl?: string; error?: string }>();
      if (!body.signedUrl) throw new Error(body.error ?? "Could not start the call");
      startedAt.current = Date.now();
      liveSince.current = Date.now();
      conversation.startSession({
        signedUrl: body.signedUrl,
        connectionType: "websocket",
        stripAudioTags: true,
        ...(scenario.openingLine ? { overrides: { agent: { firstMessage: scenario.openingLine } } } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the call");
      setStatus("idle");
    }
  }, [conversation, persona.elevenLabsAgentId, scenario.openingLine]);

  const pause = useCallback(() => {
    if (status !== "live") return;
    wasMutedBeforePause.current = conversation.isMuted;
    if (!conversation.isMuted) conversation.setMuted(true);
    conversation.setVolume({ volume: 0 });
    elapsedBefore.current = elapsedNow();
    setElapsedMs(elapsedBefore.current);
    setStatus("paused");
  }, [conversation, status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    if (!wasMutedBeforePause.current) conversation.setMuted(false);
    conversation.setVolume({ volume: 1 });
    liveSince.current = Date.now();
    setStatus("live");
  }, [conversation, status]);

  const end = useCallback(async () => {
    if (status === "live") elapsedBefore.current = elapsedNow();
    if (status === "live" || status === "paused") conversation.endSession();
    setStatus("ended");
    return transcriptRef.current;
  }, [conversation, status]);

  const toggleMute = useCallback(() => conversation.setMuted(!conversation.isMuted), [conversation]);

  return {
    status,
    isSpeaking: conversation.isSpeaking,
    isMuted: conversation.isMuted,
    videoStream,
    transcript,
    elapsedMs,
    error,
    start,
    end,
    pause,
    resume,
    toggleMute,
  };
}

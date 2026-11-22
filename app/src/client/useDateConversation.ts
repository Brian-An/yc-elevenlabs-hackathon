/**
 * The voice conversation for a date. THIS IS WHERE ELEVENLABS PLUGS IN.
 *
 * The page only uses what this hook returns (status, isSpeaking, isMuted, videoStream, transcript, elapsedMs,
 * start, end, pause, resume, toggleMute),
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
 *   pause   -> mute the mic and silence the agent (e.g. setVolume({ volume: 0 })), stop the timer;
 *              resume restores both. ElevenLabs has no true pause, so the session stays open.
 *   isSpeaking -> conversation.isSpeaking
 *
 * Until then, the mock below replays a sample transcript so the UI can be built and demoed.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Persona, Scenario, Transcript, TranscriptTurn } from "../shared/types";

export type ConversationStatus = "idle" | "connecting" | "live" | "paused" | "ended";

export type DateConversation = {
  status: ConversationStatus;
  /** The persona is talking right now (drives the avatar's speaking state). */
  isSpeaking: boolean;
  isMuted: boolean;
  /**
   * The persona's avatar video, once the avatar provider (LiveAvatar, Runway or D-ID) is connected.
   * null shows the persona's initial instead. From a LiveKit/WebRTC track: new MediaStream([track.mediaStreamTrack]).
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
  const [videoStream] = useState<MediaStream | null>(null); // MOCK: no avatar video yet

  // elapsedMs = time live so far; `liveSince` is when the current live stretch began.
  const elapsedBefore = useRef(0);
  const liveSince = useRef(0);
  const timers = useRef<number[]>([]);
  const transcriptRef = useRef<Transcript>([]);
  const queue = useRef<Transcript>([]); // MOCK: sample turns not yet spoken

  const append = useCallback((turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
  }, []);

  const elapsedNow = () => elapsedBefore.current + (Date.now() - liveSince.current);

  // Call timer
  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(elapsedNow()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // MOCK: schedule the remaining sample turns relative to the current elapsed time.
  const playQueue = useCallback(() => {
    const now = elapsedBefore.current;
    queue.current.forEach((turn) => {
      const at = Math.max(0, turn.timestamp - now);
      const speakFor = Math.min(2600, 600 + turn.text.length * 35);
      if (turn.speaker === "agent") {
        timers.current.push(window.setTimeout(() => setIsSpeaking(true), at + 300));
        timers.current.push(window.setTimeout(() => setIsSpeaking(false), at + 300 + speakFor));
      }
      timers.current.push(
        window.setTimeout(() => {
          queue.current = queue.current.filter((t) => t !== turn);
          append(turn);
        }, at + 300 + (turn.speaker === "agent" ? 200 : speakFor)),
      );
    });
  }, [append]);

  const start = useCallback(async () => {
    // --- MOCK: replace with ElevenLabs startSession (see header) ---
    void persona;
    setStatus("connecting");
    await new Promise((r) => setTimeout(r, 700));
    elapsedBefore.current = 0;
    liveSince.current = Date.now();
    transcriptRef.current = [];
    setTranscript([]);
    setElapsedMs(0);
    setStatus("live");
    queue.current = sampleTranscript.length
      ? [...sampleTranscript]
      : [{ speaker: "agent" as const, text: scenario.openingLine ?? "Hey! Nice to finally meet you.", timestamp: 0 }];
    playQueue();
    // --- END MOCK ---
  }, [persona, playQueue, sampleTranscript, scenario.openingLine]);

  const pause = useCallback(() => {
    if (status !== "live") return;
    // --- MOCK: replace with mic mute + agent volume 0 (see header) ---
    clearTimers();
    setIsSpeaking(false);
    elapsedBefore.current = elapsedNow();
    setElapsedMs(elapsedBefore.current);
    setStatus("paused");
  }, [status]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    liveSince.current = Date.now();
    setStatus("live");
    playQueue(); // MOCK
  }, [playQueue, status]);

  const end = useCallback(async () => {
    // --- MOCK: replace with conversation.endSession() ---
    clearTimers();
    setIsSpeaking(false);
    if (status === "live") elapsedBefore.current = elapsedNow();
    setStatus("ended");
    return transcriptRef.current;
  }, [status]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  return { status, isSpeaking, isMuted, videoStream, transcript, elapsedMs, error, start, end, pause, resume, toggleMute };
}

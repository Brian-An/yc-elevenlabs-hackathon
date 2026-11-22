/**
 * The voice conversation for a date.
 *
 * Live mode (the session has an ElevenLabs `agentId`): fetches a signed URL from our server
 * (GET /api/elevenlabs/signed-url, so the API key stays server-side) and starts an
 * @elevenlabs/react session. `userContext` is passed as the dynamic variable {{user_context}},
 * which the agent's prompt uses to follow up on something the user said last time.
 * Must render inside <ConversationProvider> (DatePage does this).
 *
 * Mock mode (no agentId, e.g. no ELEVENLABS_* keys set): replays a sample transcript so the
 * UI and the transcript → evaluation → memory loop can be demoed without a voice call.
 *
 * Pause: ElevenLabs has no real pause, so the session stays open with the mic muted and the
 * agent's volume at 0, and the timer stops.
 */
import { useConversation } from "@elevenlabs/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "wasp/client/api";
import type { Persona, Scenario, Transcript, TranscriptTurn } from "../shared/types";

export type ConversationStatus = "idle" | "connecting" | "live" | "paused" | "ended";

export type DateConversation = {
  status: ConversationStatus;
  /** True when a real ElevenLabs call is used, false for the mock. */
  isLive: boolean;
  /** The persona is talking right now (drives the avatar's speaking state). */
  isSpeaking: boolean;
  isMuted: boolean;
  /**
   * The persona's avatar video, once the avatar provider (LiveAvatar, Runway or D-ID) is connected.
   * null shows the persona's initial instead. From a LiveKit/WebRTC track: new MediaStream([track.mediaStreamTrack]).
   */
  videoStream: MediaStream | null;
  transcript: Transcript;
  /** The persona's voice level right now, 0-1. Read it per animation frame (it is not React state). */
  getOutputVolume: () => number;
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
  agentId,
  userContext,
  sampleTranscript = [],
  onTurn,
}: {
  persona: Persona;
  scenario: Scenario;
  /** ElevenLabs agent for this date. null runs the mock. */
  agentId: string | null;
  /** Something the user told this persona last time, or null. */
  userContext: string | null;
  /** Mock only: turns to replay after start. */
  sampleTranscript?: Transcript;
  /** Called for every new turn (the page saves them as they arrive). */
  onTurn?: (turn: TranscriptTurn) => void;
}): DateConversation {
  const isLive = Boolean(agentId);
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [mockSpeaking, setMockSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<Transcript>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoStream] = useState<MediaStream | null>(null); // avatar provider not connected yet

  // elapsedMs = time live so far; `liveSince` is when the current live stretch began.
  const elapsedBefore = useRef(0);
  const liveSince = useRef(0);
  const transcriptRef = useRef<Transcript>([]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  const elapsedNow = () =>
    elapsedBefore.current + (statusRef.current === "live" ? Date.now() - liveSince.current : 0);

  const append = useCallback((turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
    onTurnRef.current?.(turn);
  }, []);

  const goLive = () => {
    elapsedBefore.current = 0;
    liveSince.current = Date.now();
    transcriptRef.current = [];
    setTranscript([]);
    setElapsedMs(0);
    setStatus("live");
  };

  // Call timer
  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(elapsedNow()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  // ---------------------------------------------------------------- live (ElevenLabs)
  const paused = status === "paused";
  const conversation = useConversation({
    micMuted: isMuted || paused,
    volume: paused ? 0 : 1,
    onConnect: () => goLive(),
    onDisconnect: () => {
      if (statusRef.current === "live" || statusRef.current === "paused") {
        elapsedBefore.current = elapsedNow();
        setStatus("ended");
      }
    },
    onMessage: ({ message, role }) => {
      if (!message.trim()) return;
      append({ speaker: role === "user" ? "user" : "agent", text: message, timestamp: elapsedNow() });
    },
    onError: (message) => {
      setError(message || "The voice connection failed.");
      if (statusRef.current === "connecting") setStatus("idle");
    },
  });

  const startLive = async () => {
    setError(null);
    setStatus("connecting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const { signedUrl } = await api
        .get("api/elevenlabs/signed-url", { searchParams: { agentId: agentId! } })
        .json<{ signedUrl: string }>();
      conversation.startSession({
        signedUrl,
        // Every {{variable}} in the agent prompt needs a value, so send "None" when there's nothing to follow up on.
        dynamicVariables: { user_context: userContext ?? "None" },
      });
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access is needed for the date. Allow it in your browser and try again."
          : "Couldn't start the call. Check the ElevenLabs keys on the server and try again.",
      );
      setStatus("idle");
    }
  };

  // ---------------------------------------------------------------- mock
  const timers = useRef<number[]>([]);
  const queue = useRef<Transcript>([]); // sample turns not yet spoken
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Schedule the remaining sample turns relative to the current elapsed time.
  const playQueue = useCallback(() => {
    const now = elapsedBefore.current;
    queue.current.forEach((turn) => {
      const at = Math.max(0, turn.timestamp - now);
      const speakFor = Math.min(2600, 600 + turn.text.length * 35);
      if (turn.speaker === "agent") {
        timers.current.push(window.setTimeout(() => setMockSpeaking(true), at + 300));
        timers.current.push(window.setTimeout(() => setMockSpeaking(false), at + 300 + speakFor));
      }
      timers.current.push(
        window.setTimeout(() => {
          queue.current = queue.current.filter((t) => t !== turn);
          append({ ...turn, timestamp: elapsedNow() });
        }, at + 300 + (turn.speaker === "agent" ? 200 : speakFor)),
      );
    });
  }, [append]);

  const startMock = async () => {
    setStatus("connecting");
    await new Promise((r) => setTimeout(r, 700));
    goLive();
    const opener: TranscriptTurn = {
      speaker: "agent",
      // Stands in for what the real agent does with {{user_context}}.
      text: userContext
        ? `Hey, good to see you again! Last time you told me "${userContext}" So, how did it go?`
        : (scenario.openingLine ?? `Hey! I'm ${persona.name}. Nice to finally meet you.`),
      timestamp: 0,
    };
    const rest = sampleTranscript.length ? sampleTranscript.slice(sampleTranscript[0]?.speaker === "agent" ? 1 : 0) : [];
    queue.current = [opener, ...rest];
    playQueue();
  };

  // ---------------------------------------------------------------- controls
  const start = useCallback(async () => {
    if (isLive) await startLive();
    else await startMock();
  }, [isLive, agentId, userContext, sampleTranscript, scenario.openingLine, persona.name]);

  const pause = useCallback(() => {
    if (statusRef.current !== "live") return;
    if (!isLive) {
      clearTimers();
      setMockSpeaking(false);
    }
    elapsedBefore.current = elapsedNow();
    setElapsedMs(elapsedBefore.current);
    setStatus("paused");
  }, [isLive]);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    liveSince.current = Date.now();
    setStatus("live");
    if (!isLive) playQueue();
  }, [isLive, playQueue]);

  const end = useCallback(async () => {
    elapsedBefore.current = elapsedNow();
    setStatus("ended");
    if (isLive) conversation.endSession();
    else {
      clearTimers();
      setMockSpeaking(false);
    }
    return transcriptRef.current;
  }, [isLive, conversation]);

  const toggleMute = useCallback(() => setIsMuted((m) => !m), []);

  const isSpeaking = isLive ? conversation.isSpeaking && status === "live" : mockSpeaking;

  // The mock has no audio, so it fakes a syllable-like rhythm while it "speaks".
  const isSpeakingRef = useRef(isSpeaking);
  isSpeakingRef.current = isSpeaking;
  const getOutputVolume = useCallback(() => {
    if (isLive) return conversation.getOutputVolume();
    if (!isSpeakingRef.current) return 0;
    const t = performance.now() / 1000;
    return 0.35 + 0.3 * Math.abs(Math.sin(t * 9)) * Math.abs(Math.sin(t * 2.3));
  }, [isLive, conversation]);

  return { status, isLive, isSpeaking, isMuted, videoStream, transcript, getOutputVolume, elapsedMs, error, start, end, pause, resume, toggleMute };
}

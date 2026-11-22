/**
 * The voice+video conversation for a date, via HeyGen LiveAvatar's ElevenLabs Agent Connector.
 * HeyGen's backend talks to the ElevenLabs agent directly (STT, LLM, TTS) and lip-syncs its
 * audio onto a stock avatar; this session only fetches a short-lived token from our server
 * (src/server/heygen.ts), joins the LiveKit room the SDK sets up, publishes the mic, and
 * renders the resulting video. See https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent
 *
 * Same `DateConversation` shape as useDateConversation, plus `attach`/`videoReady` for
 * AvatarStage, since the SDK hands back video by attaching to an element, not a MediaStream.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LiveAvatarSession,
  SessionEvent,
  SessionState,
  AgentEventsEnum,
  VoiceChatEvent,
} from "@heygen/liveavatar-web-sdk";
import { api } from "wasp/client/api";
import type { Transcript, TranscriptTurn } from "../shared/types";
import type { ConversationStatus, DateConversation } from "./useDateConversation";
import { requestErrorMessage } from "./requestError";

// SDK 0.0.20's `autoKeepAlive` session option is declared but never actually wired up (no
// internal timer calls session.keepAlive()), so without one of our own, HeyGen's server-side
// idle timeout drops the session silently after well under a minute.
const KEEP_ALIVE_MS = 20_000;

// ElevenLabs' expressive mode can emit bracketed stage directions (e.g. "[warm]", "[laughs]")
// in the transcript text. The @elevenlabs/react path strips these via stripAudioTags; HeyGen's
// connector forwards the raw text, so we strip them here instead.
const stripTags = (text: string) => text.replace(/\[[^[\]]{1,30}\]/g, "").replace(/\s{2,}/g, " ").trim();

export function useAvatarSession({
  agentId,
  personaId,
  onTurn,
}: {
  /** ElevenLabs agent HeyGen's connector talks to. */
  agentId: string;
  /** Picks this persona's HeyGen avatar (HEYGEN_AVATAR_ID_<PERSONA>), falling back to the shared one. */
  personaId: string;
  /** Called once a turn is final (the page saves it). Chunk updates only touch local state. */
  onTurn?: (turn: TranscriptTurn) => void;
}): DateConversation & { attach: (el: HTMLVideoElement) => void; videoReady: boolean } {
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [transcript, setTranscript] = useState<Transcript>([]);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const elementRef = useRef<HTMLVideoElement | null>(null);
  const elapsedBefore = useRef(0);
  const liveSince = useRef(0);
  const transcriptRef = useRef<Transcript>([]);
  const statusRef = useRef(status);
  statusRef.current = status;
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;
  // Which speaker's reply is still streaming in via chunk events, if any.
  const pendingSpeaker = useRef<TranscriptTurn["speaker"] | null>(null);
  const keepAliveTimer = useRef<number | null>(null);

  const elapsedNow = () =>
    elapsedBefore.current + (statusRef.current === "live" ? Date.now() - liveSince.current : 0);

  // Chunk: appends to (agent, word-by-word) or replaces (user, cumulative phrase) the in-progress
  // turn for immediate feedback, without persisting it yet (kept local until the final event).
  const onChunk = useCallback((speaker: TranscriptTurn["speaker"], text: string, cumulative: boolean) => {
    if (statusRef.current === "paused") return;
    const clean = stripTags(text);
    if (!clean) return;
    if (pendingSpeaker.current === speaker) {
      const prev = transcriptRef.current[transcriptRef.current.length - 1];
      const next = { ...prev, text: cumulative ? clean : prev.text + clean };
      transcriptRef.current = [...transcriptRef.current.slice(0, -1), next];
    } else {
      pendingSpeaker.current = speaker;
      transcriptRef.current = [...transcriptRef.current, { speaker, text: clean, timestamp: elapsedNow() }];
    }
    setTranscript(transcriptRef.current);
  }, []);

  // Final: the authoritative text for a turn. Replaces whatever chunks built up, then persists it.
  const onFinal = useCallback((speaker: TranscriptTurn["speaker"], text: string) => {
    pendingSpeaker.current = null;
    if (statusRef.current === "paused") return;
    const clean = stripTags(text);
    if (!clean) return;
    const prev = transcriptRef.current[transcriptRef.current.length - 1];
    const turn: TranscriptTurn = { speaker, text: clean, timestamp: prev?.speaker === speaker ? prev.timestamp : elapsedNow() };
    transcriptRef.current =
      prev?.speaker === speaker ? [...transcriptRef.current.slice(0, -1), turn] : [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
    onTurnRef.current?.(turn);
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(elapsedNow()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const stopKeepAlive = () => {
    if (keepAliveTimer.current) window.clearInterval(keepAliveTimer.current);
    keepAliveTimer.current = null;
  };

  // Stop the HeyGen session if the component unmounts mid-call.
  useEffect(
    () => () => {
      stopKeepAlive();
      void sessionRef.current?.stop().catch(() => {});
    },
    [],
  );

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setVideoReady(false);
    transcriptRef.current = [];
    pendingSpeaker.current = null;
    setTranscript([]);
    elapsedBefore.current = 0;
    setElapsedMs(0);
    try {
      // Requested explicitly (rather than left to the SDK's own internal createLocalAudioTrack
      // call) so a denied/unavailable mic surfaces here instead of failing silently: configureSession
      // only console.warns on a voice chat start failure, it never reaches our error state.
      const warm = await navigator.mediaDevices.getUserMedia({ audio: true });
      warm.getTracks().forEach((t) => t.stop());

      const { sessionToken } = await api
        .get("api/heygen/session-token", { searchParams: { agentId, personaId } })
        .json<{ sessionToken: string }>();

      const session = new LiveAvatarSession(sessionToken);
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (elementRef.current) session.attach(elementRef.current);
        setVideoReady(true);
      });
      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        if (state === SessionState.CONNECTED) {
          liveSince.current = Date.now();
          setStatus("live");
          stopKeepAlive();
          keepAliveTimer.current = window.setInterval(() => {
            sessionRef.current?.keepAlive().catch(() => {});
          }, KEEP_ALIVE_MS);
        } else if (state === SessionState.DISCONNECTED) {
          stopKeepAlive();
          setStatus((s) => (s === "paused" ? s : "ended"));
        }
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => setIsSpeaking(true));
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => setIsSpeaking(false));
      session.on(AgentEventsEnum.USER_TRANSCRIPTION_CHUNK, (event) => onChunk("user", event.text, true));
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION_CHUNK, (event) => onChunk("agent", event.text, false));
      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event) => onFinal("user", event.text));
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (event) => onFinal("agent", event.text));
      session.voiceChat.on(VoiceChatEvent.MUTED, () => setIsMuted(true));
      session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setIsMuted(false));

      await session.start();
      // Started explicitly here (not via the constructor's `voiceChat` config) so a failure
      // throws into this try/catch instead of configureSession's internal console.warn-and-continue.
      await session.voiceChat.start();
    } catch (err) {
      await sessionRef.current?.stop().catch(() => {});
      sessionRef.current = null;
      stopKeepAlive();
      setError(await requestErrorMessage(err, "Could not start the call"));
      setStatus("idle");
    }
  }, [agentId, personaId, onChunk, onFinal]);

  const pause = useCallback(() => {
    if (statusRef.current !== "live") return;
    sessionRef.current?.voiceChat.mute().catch((err) => setError(err instanceof Error ? err.message : "Could not mute the microphone"));
    elapsedBefore.current = elapsedNow();
    setElapsedMs(elapsedBefore.current);
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    if (!isMuted) {
      sessionRef.current?.voiceChat
        .unmute()
        .catch((err) => setError(err instanceof Error ? err.message : "Could not resume the microphone"));
    }
    liveSince.current = Date.now();
    setStatus("live");
  }, [isMuted]);

  const end = useCallback(async () => {
    if (statusRef.current === "live") elapsedBefore.current = elapsedNow();
    stopKeepAlive();
    await sessionRef.current?.stop().catch(() => {});
    setStatus("ended");
    return transcriptRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    const chat = sessionRef.current?.voiceChat;
    if (!chat) return;
    (isMuted ? chat.unmute() : chat.mute()).catch((err) =>
      setError(err instanceof Error ? err.message : "Could not change the microphone"),
    );
  }, [isMuted]);

  const attach = useCallback(
    (el: HTMLVideoElement) => {
      elementRef.current = el;
      if (videoReady) sessionRef.current?.attach(el);
    },
    [videoReady],
  );

  return {
    status,
    isLive: true,
    isSpeaking,
    isMuted,
    videoStream: null,
    transcript,
    // HeyGen's audio plays through the video element, so there is no meter to read. The halo this
    // feeds only shows on the stand-in photo, which the avatar video replaces once it is ready.
    getOutputVolume: () => 0,
    elapsedMs,
    error,
    start,
    end,
    pause,
    resume,
    toggleMute,
    attach,
    videoReady,
  };
}

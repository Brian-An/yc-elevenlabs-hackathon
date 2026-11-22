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

export function useAvatarSession({
  agentId,
  onTurn,
}: {
  /** ElevenLabs agent HeyGen's connector talks to. */
  agentId: string;
  /** Called for every new turn (the page saves them as they arrive). */
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

  const elapsedNow = () =>
    elapsedBefore.current + (statusRef.current === "live" ? Date.now() - liveSince.current : 0);

  const append = useCallback((turn: TranscriptTurn) => {
    transcriptRef.current = [...transcriptRef.current, turn];
    setTranscript(transcriptRef.current);
    onTurnRef.current?.(turn);
  }, []);

  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(elapsedNow()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  // Stop the HeyGen session if the component unmounts mid-call.
  useEffect(() => () => void sessionRef.current?.stop().catch(() => {}), []);

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setVideoReady(false);
    transcriptRef.current = [];
    setTranscript([]);
    elapsedBefore.current = 0;
    setElapsedMs(0);
    try {
      const { sessionToken } = await api
        .get("api/heygen/session-token", { searchParams: { agentId } })
        .json<{ sessionToken: string }>();

      const session = new LiveAvatarSession(sessionToken, { autoKeepAlive: true });
      sessionRef.current = session;

      session.on(SessionEvent.SESSION_STREAM_READY, () => {
        if (elementRef.current) session.attach(elementRef.current);
        setVideoReady(true);
      });
      session.on(SessionEvent.SESSION_STATE_CHANGED, (state) => {
        if (state === SessionState.CONNECTED) {
          liveSince.current = Date.now();
          setStatus("live");
        } else if (state === SessionState.DISCONNECTED) {
          setStatus((s) => (s === "paused" ? s : "ended"));
        }
      });
      session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => setIsSpeaking(true));
      session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => setIsSpeaking(false));
      session.on(AgentEventsEnum.USER_TRANSCRIPTION, (event) =>
        append({ speaker: "user", text: event.text, timestamp: elapsedNow() }),
      );
      session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (event) =>
        append({ speaker: "agent", text: event.text, timestamp: elapsedNow() }),
      );
      session.voiceChat.on(VoiceChatEvent.MUTED, () => setIsMuted(true));
      session.voiceChat.on(VoiceChatEvent.UNMUTED, () => setIsMuted(false));

      await session.start();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the call");
      setStatus("idle");
    }
  }, [agentId]);

  const pause = useCallback(() => {
    if (statusRef.current !== "live") return;
    sessionRef.current?.voiceChat.mute().catch(() => {});
    elapsedBefore.current = elapsedNow();
    setElapsedMs(elapsedBefore.current);
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    if (!isMuted) sessionRef.current?.voiceChat.unmute().catch(() => {});
    liveSince.current = Date.now();
    setStatus("live");
  }, [isMuted]);

  const end = useCallback(async () => {
    if (statusRef.current === "live") elapsedBefore.current = elapsedNow();
    await sessionRef.current?.stop().catch(() => {});
    setStatus("ended");
    return transcriptRef.current;
  }, []);

  const toggleMute = useCallback(() => {
    const chat = sessionRef.current?.voiceChat;
    if (!chat) return;
    void (isMuted ? chat.unmute() : chat.mute());
  }, [isMuted]);

  const attach = useCallback((el: HTMLVideoElement) => {
    elementRef.current = el;
    if (videoReady) sessionRef.current?.attach(el);
  }, [videoReady]);

  return {
    status,
    isLive: true,
    isSpeaking,
    isMuted,
    videoStream: null,
    transcript,
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

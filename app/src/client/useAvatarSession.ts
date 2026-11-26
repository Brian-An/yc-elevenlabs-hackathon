/**
 * The voice+video conversation for a date, via Anam's server-side ElevenLabs integration.
 * Anam's engine talks to the ElevenLabs agent directly (STT, LLM, TTS) and lip-syncs its audio
 * onto the avatar; this session only fetches a short-lived token from our server
 * (src/server/anam.ts), streams the mic, and renders the resulting video, whose audio plays
 * through the same element. See https://anam.ai/docs/integrations/elevenlabs/start-session
 *
 * Same `DateConversation` shape as useDateConversation, plus `attach`/`videoReady` for
 * AvatarStage, since the SDK streams into a video element by its id rather than handing back a MediaStream.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AnamEvent, ConnectionClosedCode, createClient, MessageRole, type AnamClient, type MessageStreamEvent } from "@anam-ai/js-sdk";
import { api } from "wasp/client/api";
import type { Transcript, TranscriptTurn } from "../shared/types";
import type { ConversationStatus, DateConversation } from "./useDateConversation";
import { getUserId } from "./userId";
import { CallTranscript } from "./callTranscript";
import { requestErrorMessage } from "./requestError";

// ElevenLabs' expressive mode can emit bracketed stage directions (e.g. "[warm]", "[laughs]")
// in the transcript text. The @elevenlabs/react path strips these via stripAudioTags; Anam
// forwards the raw text, so we strip them here instead.
const TAGS = /\[[^[\]]{1,30}\]/g;
const stripTags = (text: string) => text.replace(TAGS, "").replace(/\s{2,}/g, " ").trim();

let videoIds = 0;

export function useAvatarSession({
  sessionId,
  initialTranscript,
  onTurn,
}: {
  sessionId: string;
  initialTranscript: Transcript;
  /** Called once a turn is final (the page saves it). Chunk updates only touch local state. */
  onTurn?: (turn: TranscriptTurn) => void;
}): DateConversation & { attach: (el: HTMLVideoElement) => void; videoReady: boolean } {
  const [status, setStatus] = useState<ConversationStatus>("idle");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [recorder] = useState(() => new CallTranscript(initialTranscript));
  const [transcript, setTranscript] = useState<Transcript>(recorder.turns);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<AnamClient | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const elementRef = useRef<HTMLVideoElement | null>(null);
  // Anam streams message text in pieces that share an id until endOfSpeech.
  const messages = useRef(new Map<string, string>());
  const elapsedBefore = useRef(initialTranscript.at(-1)?.timestamp ?? 0);
  const liveSince = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;
  const onTurnRef = useRef(onTurn);
  onTurnRef.current = onTurn;

  const elapsedNow = () =>
    elapsedBefore.current + (statusRef.current === "live" ? Date.now() - liveSince.current : 0);

  const onMessage = useCallback((event: MessageStreamEvent) => {
    const speaker = event.role === MessageRole.PERSONA ? "agent" : "user";
    if (speaker === "agent") setIsSpeaking(!event.endOfSpeech);
    if (statusRef.current === "paused") return;
    const text = (messages.current.get(event.id) ?? "") + event.content;
    messages.current.set(event.id, text);
    if (!event.endOfSpeech) {
      const chunk = text.replace(TAGS, "");
      if (chunk) setTranscript(recorder.chunk(speaker, chunk, elapsedNow(), true));
      return;
    }
    messages.current.delete(event.id);
    const clean = stripTags(text);
    if (!clean) return;
    const turn = recorder.finish({ speaker, text: clean, timestamp: elapsedNow() }, [event.id]);
    setTranscript(recorder.display());
    if (turn) onTurnRef.current?.(turn);
  }, [recorder]);

  useEffect(() => {
    if (status !== "live") return;
    const id = window.setInterval(() => setElapsedMs(elapsedNow()), 250);
    return () => window.clearInterval(id);
  }, [status]);

  const stopMic = () => {
    micRef.current?.getTracks().forEach((track) => track.stop());
    micRef.current = null;
  };

  const stop = async () => {
    const client = clientRef.current;
    clientRef.current = null;
    stopMic();
    await client?.stopStreaming().catch(() => {});
  };

  // Stop the Anam session if the component unmounts mid-call.
  useEffect(() => () => void stop(), []);

  const start = useCallback(async () => {
    setStatus("connecting");
    setError(null);
    setVideoReady(false);
    recorder.reconnect();
    messages.current.clear();
    setTranscript(recorder.turns);
    setElapsedMs(elapsedBefore.current);
    try {
      const element = elementRef.current;
      if (!element) throw new Error("The video isn't ready yet. Try again.");
      // Captured here, rather than left to the SDK, so a denied or missing mic surfaces as our error
      // and the tracks can be stopped when the date ends.
      micRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });

      const { sessionToken } = await api
        .get("api/anam/session-token", { searchParams: { sessionId }, headers: { "X-Bantr-User": getUserId() } })
        .json<{ sessionToken: string }>();

      const client = createClient(sessionToken);
      clientRef.current = client;
      // Listeners go on before streaming starts, so no early event is missed.
      client.addListener(AnamEvent.CONNECTION_ESTABLISHED, () => {
        liveSince.current = Date.now();
        setStatus("live");
      });
      client.addListener(AnamEvent.VIDEO_PLAY_STARTED, () => setVideoReady(true));
      client.addListener(AnamEvent.MESSAGE_STREAM_EVENT_RECEIVED, onMessage);
      client.addListener(AnamEvent.CONNECTION_CLOSED, (reason) => {
        stopMic();
        setIsSpeaking(false);
        if (reason !== ConnectionClosedCode.NORMAL) setError("The video call dropped. Start it again to continue.");
        setStatus((s) => (s === "paused" || s === "idle" ? s : "ended"));
      });
      await client.streamToVideoElement(element.id, micRef.current);
    } catch (err) {
      await stop();
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access is needed for the date. Allow it in your browser and try again."
          : await requestErrorMessage(err, "Could not start the call"),
      );
      setStatus("idle");
    }
  }, [sessionId, recorder, onMessage]);

  const pause = useCallback(() => {
    if (statusRef.current !== "live") return;
    clientRef.current?.muteInputAudio();
    elapsedBefore.current = elapsedNow();
    setElapsedMs(elapsedBefore.current);
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    if (!isMuted) clientRef.current?.unmuteInputAudio();
    liveSince.current = Date.now();
    setStatus("live");
  }, [isMuted]);

  const end = useCallback(async () => {
    if (statusRef.current === "live") elapsedBefore.current = elapsedNow();
    // Closing the stream takes seconds, so it finishes in the background and the date saves right away.
    void stop();
    setStatus("ended");
    setTranscript(recorder.turns);
    return recorder.turns;
  }, [recorder]);

  const toggleMute = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    if (isMuted) client.unmuteInputAudio();
    else client.muteInputAudio();
    setIsMuted(!isMuted);
  }, [isMuted]);

  const attach = useCallback((el: HTMLVideoElement) => {
    // The SDK finds its video element by id.
    if (!el.id) el.id = `anam-video-${++videoIds}`;
    elementRef.current = el;
  }, []);

  return {
    status,
    isLive: true,
    isSpeaking,
    isMuted,
    videoStream: null,
    transcript,
    // Anam's audio plays through the video element, so there is no meter to read. The halo this
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Captions, CaptionsOff, Maximize2, MessageSquare, Mic, MicOff, Minimize2, Pause, Phone, PhoneOff, Play } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { routes } from "wasp/client/router";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { AvatarStage } from "@/components/AvatarStage";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatThread, type ChatMessage } from "@/components/arc/chat-thread/chat-thread";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Alert } from "@/components/arc/alert/alert";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { DIFFICULTY_LABEL, getMockDateSession } from "@/client/mockData";
import { useDateConversation, type ConversationStatus, type DateConversation } from "@/client/useDateConversation";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<ConversationStatus, string> = {
  idle: "Ready when you are!",
  connecting: "Connecting...",
  live: "Live",
  paused: "Paused",
  ended: "Date over",
};

const SUBTITLES_KEY = "bantr:subtitles";

export function DatePage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  // Swap for: const { data: session } = useQuery(getDateSession, { sessionId })
  const session = getMockDateSession(sessionId);
  const { persona, scenario } = session;

  // ElevenLabs plugs in inside this hook (src/client/useDateConversation.ts).
  const call = useDateConversation({ persona, scenario, sampleTranscript: session.sampleTranscript });
  const [ending, setEnding] = useState(false);

  // Arc ChatThread wants absolute times; anchor turn offsets to a fixed start.
  const [anchor] = useState(() => Date.now());
  const messages = useMemo<ChatMessage[]>(
    () =>
      call.transcript.map((turn, i) => ({
        id: `${i}`,
        authorId: turn.speaker,
        text: turn.text,
        createdAt: anchor + turn.timestamp,
      })),
    [call.transcript, anchor],
  );

  async function endDate() {
    setEnding(true);
    const transcript = await call.end();
    // TODO(backend): await endSession({ sessionId, transcript })  -> runs the evaluator
    console.info("transcript", transcript);
    navigate(routes.FeedbackRoute.build({ params: { sessionId } }));
  }

  const live = call.status === "live";

  // Fullscreen: just the persona, transcript hidden. Uses the browser Fullscreen API on the stage
  // (Esc exits), with a fixed full-window layout as the fallback where the API isn't available.
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = useCallback(async () => {
    if (fullscreen) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
      setFullscreen(false);
      return;
    }
    setFullscreen(true);
    await stageRef.current?.requestFullscreen?.().catch(() => {});
  }, [fullscreen]);
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const turns = call.transcript.length;

  // Subtitles: the latest line, overlaid at the bottom of the video. Off by default; the choice is remembered.
  const [subtitles, setSubtitles] = useState(() => localStorage.getItem(SUBTITLES_KEY) === "on");
  const toggleSubtitles = () =>
    setSubtitles((on) => {
      localStorage.setItem(SUBTITLES_KEY, on ? "off" : "on");
      return !on;
    });
  const lastTurn = call.transcript[turns - 1];
  const hint = call.isSpeaking ? `${persona.name} is talking` : live ? (call.isMuted ? "You're muted" : "Listening") : null;

  return (
    <AppShell variant="focus" wide>
      <div className="grid gap-5 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Avatar video + call controls */}
        <div className="flex min-h-0 flex-col gap-4">
          <div
            ref={stageRef}
            className={cn(
              "relative lg:min-h-0 lg:flex-1",
              fullscreen && "fixed inset-0 z-50 bg-background lg:min-h-full",
            )}
          >
            <AvatarStage
              persona={persona}
              stream={call.videoStream}
              speaking={call.isSpeaking}
              className={cn("aspect-video lg:aspect-auto lg:h-full", fullscreen && "aspect-auto h-full rounded-none border-0")}
              overlay={
                <>
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 p-4">
                    <Badge size="sm" tone={live ? "success" : call.status === "paused" ? "warning" : "neutral"} dot pill>
                      {STATUS_LABEL[call.status]}
                    </Badge>
                    <div className="flex items-center gap-2">
                      <Badge size="sm" pill aria-live="off">
                        <span className="tabular-nums">{formatDuration(call.elapsedMs / 1000)}</span>
                      </Badge>
                      <Tooltip content={subtitles ? "Hide subtitles" : "Show subtitles"}>
                        <Button size="sm" variant="secondary" onClick={toggleSubtitles} aria-pressed={subtitles} aria-label="Subtitles">
                          {subtitles ? <Captions className="size-4" aria-hidden="true" /> : <CaptionsOff className="size-4" aria-hidden="true" />}
                        </Button>
                      </Tooltip>
                      {!fullscreen && (
                        <Tooltip content="Fullscreen">
                          <Button size="sm" variant="secondary" onClick={() => void toggleFullscreen()} aria-label="Enter fullscreen">
                            <Maximize2 className="size-4" aria-hidden="true" />
                          </Button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                  {subtitles && lastTurn && (
                    <div className={cn("pointer-events-none absolute inset-x-0 flex justify-center px-6", fullscreen ? "bottom-28" : "bottom-5")}>
                      <p className="max-w-2xl rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm text-white sm:text-base" aria-hidden="true">
                        <span className="font-medium">{lastTurn.speaker === "agent" ? persona.name : "You"}:</span> {lastTurn.text}
                      </p>
                    </div>
                  )}
                  {fullscreen && (
                    <div className="absolute inset-x-0 bottom-0 flex justify-center p-6">
                      <div className="flex items-center gap-2 rounded-full border border-border bg-background/85 p-2 shadow-(--shadow-resting) backdrop-blur-md">
                        <CallButtons call={call} ending={ending} onEnd={() => void endDate()} />
                        <Tooltip content="Exit fullscreen">
                          <Button size="lg" variant="ghost" onClick={() => void toggleFullscreen()} aria-label="Exit fullscreen">
                            <Minimize2 className="size-4" aria-hidden="true" />
                          </Button>
                        </Tooltip>
                      </div>
                    </div>
                  )}
                </>
              }
            />
          </div>

          <Panel className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-4">
            <div className="min-w-0">
              <h1 className="text-lg text-foreground">
                {persona.name}, {persona.age}
              </h1>
              <p className="mt-0.5 truncate text-sm text-subtle">{persona.personality}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge size="sm" pill>{scenario.setting}</Badge>
                <Badge size="sm" pill>{DIFFICULTY_LABEL[scenario.difficulty]}</Badge>
                {hint && (
                  <span className="text-xs text-faint" aria-live="polite">
                    {hint}
                  </span>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <CallButtons call={call} ending={ending} onEnd={() => void endDate()} />
            </div>
          </Panel>
        </div>

        {/* Live transcript */}
        <Panel className="flex h-[32rem] min-h-0 flex-col p-0 sm:p-0 lg:h-auto">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base text-foreground">Live transcript</h2>
            <span className="text-xs text-faint">
              {turns} {turns === 1 ? "turn" : "turns"}
            </span>
          </div>
          {call.error && (
            <div className="px-5 pt-4">
              <Alert tone="danger" title="Voice connection problem">
                {call.error}
              </Alert>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {messages.length === 0 ? (
              <div className="grid h-full place-items-center p-6">
                <EmptyState
                  icon={<MessageSquare width={24} height={24} strokeWidth={1.5} />}
                  title={call.status === "connecting" ? "Connecting you" : "Nothing said yet"}
                  description={`Start the date and ${persona.name} will open. Talk out loud like you would in person.`}
                />
              </div>
            ) : (
              <ChatThread
                className="h-full"
                label="Live transcript"
                composer={false}
                reactable={false}
                timestamps={false}
                deliveryStatus={false}
                currentUserId="user"
                participants={[
                  { id: "user", name: "You" },
                  { id: "agent", name: persona.name },
                ]}
                labels={{ typing: (names) => `${names[0]} is talking` }}
                messages={messages}
                typing={call.isSpeaking ? ["agent"] : []}
              />
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}

/** Start, or Mute + End once the date is on. Shared by the control bar and the fullscreen overlay. */
function CallButtons({ call, ending, onEnd }: { call: DateConversation; ending: boolean; onEnd: () => void }) {
  const live = call.status === "live";
  if (call.status === "idle" || call.status === "connecting") {
    return (
      <Button size="lg" loading={call.status === "connecting"} onClick={() => void call.start()} className="min-w-40">
        <Phone className="size-4" aria-hidden="true" /> Start date
      </Button>
    );
  }
  const paused = call.status === "paused";
  const muteLabel = call.isMuted ? "Unmute microphone" : "Mute microphone";
  return (
    <>
      <Tooltip content={muteLabel}>
        <Button size="lg" variant="secondary" onClick={call.toggleMute} disabled={!live} aria-pressed={call.isMuted} aria-label={muteLabel}>
          {call.isMuted ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
        </Button>
      </Tooltip>
      <Button size="lg" variant="secondary" onClick={paused ? call.resume : call.pause} disabled={!live && !paused}>
        {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
        {paused ? "Resume" : "Pause"}
      </Button>
      <Button size="lg" variant="danger" onClick={onEnd} loading={ending}>
        <PhoneOff className="size-4" aria-hidden="true" /> End date
      </Button>
    </>
  );
}

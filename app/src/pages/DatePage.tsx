import { useMemo, useState } from "react";
import { Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { routes } from "wasp/client/router";
import { AppShell } from "@/components/AppShell";
import { Panel } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatThread, type ChatMessage } from "@/components/arc/chat-thread/chat-thread";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Alert } from "@/components/arc/alert/alert";
import { DIFFICULTY_LABEL, getMockDateSession } from "@/client/mockData";
import { useDateConversation, type ConversationStatus } from "@/client/useDateConversation";
import { formatDuration } from "@/lib/format";

const STATUS_LABEL: Record<ConversationStatus, string> = {
  idle: "Ready when you are",
  connecting: "Connecting",
  live: "On the date",
  ended: "Date ended",
};

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

  return (
    <AppShell variant="focus" wide>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
        {/* Persona + call controls */}
        <Panel className="flex flex-col items-center text-center lg:sticky lg:top-20 lg:self-start">
          <Badge size="sm" tone={live ? "success" : "neutral"} dot pill>
            {STATUS_LABEL[call.status]}
          </Badge>

          <PersonaAvatar persona={persona} size={152} speaking={call.isSpeaking} className="mt-8" />

          <h1 className="mt-6 text-2xl text-foreground">
            {persona.name}, {persona.age}
          </h1>
          <p className="mt-1 text-sm text-subtle">{persona.personality}</p>

          <p className="mt-5 font-heading text-4xl font-medium tabular-nums text-foreground" aria-live="off">
            {formatDuration(call.elapsedMs / 1000)}
          </p>
          <p className="mt-1 h-5 text-xs text-faint" aria-live="polite">
            {call.isSpeaking ? `${persona.name} is talking` : live ? (call.isMuted ? "You're muted" : "Listening") : ""}
          </p>

          <div className="mt-6 flex w-full items-center justify-center gap-3">
            {call.status === "idle" || call.status === "connecting" ? (
              <Button size="lg" loading={call.status === "connecting"} onClick={() => void call.start()} className="min-w-44">
                <Phone className="size-4" aria-hidden="true" /> Start date
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={call.toggleMute}
                  disabled={!live}
                  aria-pressed={call.isMuted}
                  aria-label={call.isMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {call.isMuted ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
                  {call.isMuted ? "Unmute" : "Mute"}
                </Button>
                <Button size="lg" variant="danger" onClick={() => void endDate()} loading={ending}>
                  <PhoneOff className="size-4" aria-hidden="true" /> End date
                </Button>
              </>
            )}
          </div>

          <dl className="mt-8 grid w-full grid-cols-2 gap-3 border-t border-border pt-5 text-left text-xs">
            <div>
              <dt className="text-faint">Setting</dt>
              <dd className="mt-0.5 text-foreground">{scenario.setting}</dd>
            </div>
            <div>
              <dt className="text-faint">Difficulty</dt>
              <dd className="mt-0.5 text-foreground">{DIFFICULTY_LABEL[scenario.difficulty]}</dd>
            </div>
          </dl>
        </Panel>

        {/* Live transcript */}
        <Panel className="flex h-[32rem] flex-col p-0 sm:p-0 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[32rem]">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base text-foreground">Live transcript</h2>
            <span className="text-xs text-faint">{call.transcript.length} turns</span>
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
                  title={call.status === "connecting" ? "Connecting you" : "Nothing said yet"}
                  description={`Start the date and ${persona.name} will open. Talk out loud like you would in person.`}
                />
              </div>
            ) : (
              <ChatThread
                className="h-full"
                label="Live transcript"
                composer={false}
                currentUserId="user"
                participants={[
                  { id: "user", name: "You" },
                  { id: "agent", name: persona.name },
                ]}
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

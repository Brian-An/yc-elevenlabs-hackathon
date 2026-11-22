import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Captions, Check, CaptionsOff, MessageSquare, X } from "lucide-react";
import { useNavigate } from "react-router";
import { ConversationProvider } from "@elevenlabs/react";
import { appendTranscript, createDateSession, endDateSession, getDateSession, getPersonas, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import type { DateSessionDTO, PersonaWithScenario } from "../server/dto";
import { AppShell } from "@/components/AppShell";
import { CallButtons, STATUS_LABEL, useTranscriptMessages } from "@/components/DateCall";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { DIFFICULTY_LABEL, sampleTranscript } from "@/client/mockData";
import { useDateConversation } from "@/client/useDateConversation";
import { getUserId } from "@/client/userId";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createWorldBus, type WorldBus, type WorldDate } from "@/world/bus";
import { isTyping, MOVE_KEYS } from "@/world/controls";
import { TABLES } from "@/world/layout";

const WorldScene = lazy(() => import("@/world/WorldScene"));

const SUBTITLES_KEY = "bantr:worldSubtitles";
const CONTROLS_LEARNED_KEY = "bantr:worldControlsLearned";
/** On touch screens there is nothing to tick off, so the controls hint fades after this long. */
const TOUCH_HINT_MS = 10_000;
/** After both controls are ticked, the hint stays this long so the last checkmark registers. */
const HINT_DONE_LINGER_MS = 900;
const difficultyTone = { easy: "success", medium: "info", hard: "warning" } as const;

type Phase =
  | { kind: "explore" }
  | { kind: "starting"; personaId: string }
  | { kind: "date"; personaId: string; sessionId: string };

/** A walkable plaza. Walk up to someone waiting at a café table and start a practice date right there. */
export function WorldPage() {
  const navigate = useNavigate();
  const { data: personas, isLoading, error } = useQuery(getPersonas);
  const bus = useMemo(createWorldBus, []);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [nearby, setNearby] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "explore" });
  const [startError, setStartError] = useState<string | null>(null);
  // Once learned, the controls hint stays gone on this browser, including after a date and on later visits.
  const [hintDone, setHintDone] = useState(() => localStorage.getItem(CONTROLS_LEARNED_KEY) === "1");
  const onHintDone = useCallback(() => {
    localStorage.setItem(CONTROLS_LEARNED_KEY, "1");
    setHintDone(true);
  }, []);

  const list = personas ?? [];
  const nearbyPersona = list.find((p) => p.id === nearby) ?? null;
  const date: WorldDate | null = useMemo(() => {
    if (phase.kind !== "date") return null;
    const tableIndex = list.findIndex((p) => p.id === phase.personaId);
    return tableIndex >= 0 && tableIndex < TABLES.length ? { personaId: phase.personaId, tableIndex } : null;
  }, [phase, list]);

  const startDate = useCallback(async (personaId: string) => {
    setPhase({ kind: "starting", personaId });
    setStartError(null);
    try {
      const session = await createDateSession({ userId: getUserId(), personaId });
      setPhase({ kind: "date", personaId, sessionId: session.id });
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't start the date.");
      setPhase({ kind: "explore" });
    }
  }, []);

  // E talks to whoever is in reach.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase.kind === "explore" && nearby) void startDate(nearby);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, nearby, startDate]);

  if (error) {
    return (
      <AppShell>
        <EmptyState
          title="Couldn't load the plaza"
          description="The list of people to meet didn't load. Check your connection and try again."
          action={<Button onClick={() => window.location.reload()}>Try again</Button>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell bleed>
      <h1 className="sr-only">The plaza</h1>
      <p className="sr-only">
        A 3D plaza with people at café tables. Walk with the arrow keys or W A S D, and press E or use the Talk button to start a date with
        whoever is nearby.
      </p>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-[#bfe1f2]">
        {!isLoading && (
          <Suspense fallback={null}>
            <WorldScene personas={list} bus={bus} date={date} nearby={phase.kind === "explore" ? nearby : null} onNearby={setNearby} onReady={onReady} />
          </Suspense>
        )}

        {!ready && <LoadingCard />}

        {ready && phase.kind !== "date" && !hintDone && <ControlsHint onDone={onHintDone} />}

        {ready && phase.kind !== "date" && (
          <ExploreHud
            persona={phase.kind === "explore" ? nearbyPersona : list.find((p) => p.id === phase.personaId) ?? null}
            starting={phase.kind === "starting"}
            error={startError}
            onTalk={(id) => void startDate(id)}
            onDismissError={() => setStartError(null)}
          />
        )}

        {phase.kind === "date" && (
          <DateOverlay
            sessionId={phase.sessionId}
            bus={bus}
            onLeave={() => setPhase({ kind: "explore" })}
            onEnded={() => navigate(routes.FeedbackRoute.build({ params: { sessionId: phase.sessionId } }))}
          />
        )}
      </div>
    </AppShell>
  );
}

function LoadingCard() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-3 shadow-(--shadow-resting)" role="status">
        <span className="size-4 animate-spin rounded-full border-2 border-border border-t-brand motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm text-foreground">Setting up the plaza...</span>
      </div>
    </div>
  );
}

/**
 * How to move, phrased for the input the person has. On a keyboard each control turns green with a check once
 * used, and the hint fades out after both are. On touch screens it fades after a while.
 */
function ControlsHint({ onDone }: { onDone: () => void }) {
  const [walked, setWalked] = useState(false);
  const [ran, setRan] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.code in MOVE_KEYS) setWalked(true);
      if (e.key === "Shift") setRan(true);
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!(walked && ran) && !touch) return;
    const timer = window.setTimeout(() => setLeaving(true), walked && ran ? HINT_DONE_LINGER_MS : TOUCH_HINT_MS);
    return () => window.clearTimeout(timer);
  }, [walked, ran]);

  // Unmount once faded out. Reduced motion skips the fade, so no transitionend arrives.
  useEffect(() => {
    if (leaving && window.matchMedia("(prefers-reduced-motion: reduce)").matches) onDone();
  }, [leaving, onDone]);

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 top-0 flex justify-start p-3 transition-opacity duration-300 motion-reduce:transition-none sm:p-4",
        leaving && "opacity-0",
      )}
      onTransitionEnd={(e) => e.target === e.currentTarget && leaving && onDone()}
    >
      <div className="pointer-events-auto max-w-sm rounded-(--radius-panel) border border-border bg-surface/90 px-4 py-3 shadow-(--shadow-resting) backdrop-blur-md">
        <p className="text-sm font-medium text-foreground">Find someone to meet</p>
        <p className="mt-0.5 text-sm text-subtle">
          <span className="[@media(pointer:coarse)]:hidden">
            Walk with <Kbd done={walked}>W A S D</Kbd> or the arrow keys, hold <Kbd done={ran}>Shift</Kbd> to run and drag to look around.
          </span>
          <span className="hidden [@media(pointer:coarse)]:inline">Tap the ground to walk there and drag to look around.</span>
        </p>
      </div>
    </div>
  );
}

/** Errors starting a date, and the "Talk to" card when someone is in reach. */
function ExploreHud({
  persona,
  starting,
  error,
  onTalk,
  onDismissError,
}: {
  persona: PersonaWithScenario | null;
  starting: boolean;
  error: string | null;
  onTalk: (personaId: string) => void;
  onDismissError: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-6">
        <div className="flex w-full max-w-md flex-col gap-3">
          {error && (
            <div className="pointer-events-auto">
              <Alert tone="danger" title="Couldn't start the date" onDismiss={onDismissError}>
                {error}
              </Alert>
            </div>
          )}
          {persona && (
            <div
              className="pointer-events-auto rounded-(--radius-panel) border border-border bg-surface p-4 shadow-(--shadow-resting)"
              aria-live="polite"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground">
                    {persona.name}, {persona.age}
                  </p>
                  <p className="mt-0.5 text-sm text-subtle">{persona.bio}</p>
                </div>
                <Badge size="sm" tone={difficultyTone[persona.difficulty]} dot>
                  {DIFFICULTY_LABEL[persona.difficulty]}
                </Badge>
              </div>
              <Button size="lg" className="mt-4 w-full" loading={starting} onClick={() => onTalk(persona.id)}>
                Talk to {persona.name}
                <Kbd className="ml-1 border-white/40 bg-white/15 text-current [@media(pointer:coarse)]:hidden">E</Kbd>
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * A key cap. `done` marks a control the person has already tried with a check. A chip that can be ticked is sized
 * for the check from the start, so ticking it doesn't reflow the sentence around it.
 */
function Kbd({ children, className, done }: { children: ReactNode; className?: string; done?: boolean }) {
  const label = (check: boolean) => (
    <>
      {check && <Check className="size-3 shrink-0" strokeWidth={3} aria-hidden="true" />}
      {children}
    </>
  );
  return (
    <kbd
      className={cn(
        "rounded border border-border bg-surface-muted px-1.5 py-px font-sans text-xs font-medium text-foreground transition-colors duration-200 motion-reduce:transition-none",
        done && "border-success/40 bg-success/15 text-success",
        className,
      )}
    >
      {done === undefined ? (
        children
      ) : (
        <span className="inline-grid align-bottom">
          <span className="invisible col-start-1 row-start-1 inline-flex items-center gap-1" aria-hidden="true">
            {label(true)}
          </span>
          <span className="col-start-1 row-start-1 inline-flex items-center justify-center gap-1">
            {label(done)}
            {done && <span className="sr-only">(done)</span>}
          </span>
        </span>
      )}
    </kbd>
  );
}

/** Loads the new session, then runs the call inside the ElevenLabs provider. */
function DateOverlay({ sessionId, bus, onLeave, onEnded }: { sessionId: string; bus: WorldBus; onLeave: () => void; onEnded: () => void }) {
  const { data: session, error } = useQuery(getDateSession, { userId: getUserId(), id: sessionId });
  if (error) {
    return (
      <div className="absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-6">
        <div className="w-full max-w-md">
          <Alert tone="danger" title="Couldn't load the date">
            {error.message}
          </Alert>
          <Button className="mt-3" variant="secondary" onClick={onLeave}>
            <ArrowLeft className="size-4" aria-hidden="true" /> Back to the plaza
          </Button>
        </div>
      </div>
    );
  }
  if (!session?.persona) return null;
  return (
    <ConversationProvider>
      <DateHud session={session as DateSessionDTO & { persona: NonNullable<DateSessionDTO["persona"]> }} bus={bus} onLeave={onLeave} onEnded={onEnded} />
    </ConversationProvider>
  );
}

function DateHud({
  session,
  bus,
  onLeave,
  onEnded,
}: {
  session: DateSessionDTO & { persona: NonNullable<DateSessionDTO["persona"]> };
  bus: WorldBus;
  onLeave: () => void;
  onEnded: () => void;
}) {
  const { id: sessionId, persona, scenario } = session;
  const call = useDateConversation({
    persona,
    scenario,
    agentId: session.agentId,
    userContext: session.userContext,
    sampleTranscript,
    // Save each turn as it arrives, so a closed tab doesn't lose the date.
    onTurn: (turn) => {
      appendTranscript({ userId: getUserId(), id: sessionId, turns: [turn] }).catch((err) => console.warn("[world] couldn't save a turn:", err));
    },
  });

  // The persona's head and chest follow their voice.
  useEffect(() => {
    bus.voice = call.getOutputVolume;
    return () => {
      bus.voice = () => 0;
    };
  }, [bus, call.getOutputVolume]);

  // Pressing Talk is the go-ahead, so the call starts while the two of you sit down.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void call.start();
  }, [call]);

  const [ending, setEnding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  async function endDate() {
    setEnding(true);
    const transcript = await call.end();
    try {
      await endDateSession({ userId: getUserId(), id: sessionId, transcript });
      onEnded();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save the date.");
      setEnding(false);
    }
  }

  const messages = useTranscriptMessages(call, session);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [subtitles, setSubtitles] = useState(() => localStorage.getItem(SUBTITLES_KEY) !== "off");
  const toggleSubtitles = () =>
    setSubtitles((on) => {
      localStorage.setItem(SUBTITLES_KEY, on ? "off" : "on");
      return !on;
    });

  const live = call.status === "live";
  const lastTurn = call.transcript[call.transcript.length - 1];
  const turns = call.transcript.length;
  const hint = call.isSpeaking ? `${persona.name} is talking` : live ? (call.isMuted ? "You're muted" : "Listening") : null;
  const notStarted = call.status === "idle";

  return (
    <>
      {/* Top: who and where, call status, timer. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto min-w-0 rounded-(--radius-panel) border border-border bg-surface/90 px-4 py-3 shadow-(--shadow-resting) backdrop-blur-md">
          <p className="text-sm font-medium text-foreground">
            Date with {persona.name}, {persona.age}
          </p>
          <p className="mt-0.5 truncate text-xs text-subtle">{scenario.setting}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge size="sm" tone={live ? "success" : call.status === "paused" ? "warning" : "neutral"} dot pill>
              {STATUS_LABEL[call.status]}
            </Badge>
            <Badge size="sm" pill aria-live="off">
              <span className="tabular-nums">{formatDuration(call.elapsedMs / 1000)}</span>
            </Badge>
            {hint && (
              <span className="text-xs text-faint" aria-live="polite">
                {hint}
              </span>
            )}
          </div>
        </div>
        <div className="pointer-events-auto flex shrink-0 items-center gap-2">
          <Tooltip content={subtitles ? "Hide subtitles" : "Show subtitles"}>
            <Button size="sm" variant="secondary" onClick={toggleSubtitles} aria-pressed={subtitles} aria-label="Subtitles">
              {subtitles ? <Captions className="size-4" aria-hidden="true" /> : <CaptionsOff className="size-4" aria-hidden="true" />}
            </Button>
          </Tooltip>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setTranscriptOpen((o) => !o)}
            aria-expanded={transcriptOpen}
            aria-controls="world-transcript"
          >
            <MessageSquare className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Transcript</span>
            {turns > 0 && <span className="tabular-nums text-subtle">{turns}</span>}
          </Button>
        </div>
      </div>

      {/* Bottom: subtitles over the controls. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-3 sm:p-6">
        {subtitles && lastTurn && (
          <p className="max-w-2xl rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm text-white sm:text-base" aria-hidden="true">
            <span className="font-medium">{lastTurn.speaker === "agent" ? persona.name : "You"}:</span> {lastTurn.text}
          </p>
        )}
        {(call.error || saveError) && (
          <div className="pointer-events-auto w-full max-w-md">
            <Alert tone="danger" title={saveError ? "Couldn't save your date" : "Voice connection problem"}>
              {saveError ?? call.error}
            </Alert>
          </div>
        )}
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-surface/90 p-2 shadow-(--shadow-resting) backdrop-blur-md">
          <CallButtons call={call} ending={ending} onEnd={() => void endDate()} />
          {notStarted && (
            <Button size="lg" variant="ghost" onClick={onLeave}>
              <ArrowLeft className="size-4" aria-hidden="true" /> Leave the table
            </Button>
          )}
        </div>
      </div>

      {/* Transcript drawer, over the right edge (full width on phones). */}
      {transcriptOpen && (
        <section
          id="world-transcript"
          aria-label="Live transcript"
          className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-border bg-surface shadow-(--shadow-resting) sm:w-[400px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="text-base text-foreground">Live transcript</h2>
            <Tooltip content="Close transcript">
              <Button size="sm" variant="ghost" onClick={() => setTranscriptOpen(false)} aria-label="Close transcript">
                <X className="size-4" aria-hidden="true" />
              </Button>
            </Tooltip>
          </div>
          <div className="min-h-0 flex-1">
            {messages.length === 0 ? (
              <div className="grid h-full place-items-center p-6">
                <EmptyState
                  icon={<MessageSquare width={24} height={24} strokeWidth={1.5} />}
                  title={call.status === "connecting" ? "Connecting you" : "Nothing said yet"}
                  description={`${persona.name} will open. Talk out loud like you would in person.`}
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
        </section>
      )}
    </>
  );
}

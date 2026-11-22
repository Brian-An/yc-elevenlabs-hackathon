import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, MessageSquare, Mic, MicOff, Pause, Phone, PhoneOff, Play, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useNavigate } from "react-router";
import { ConversationProvider } from "@elevenlabs/react";
import { appendTranscript, createDateSession, endDateSession, getDateSession, getPersonas, useQuery } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import type { DateSessionDTO, PersonaWithScenario } from "../server/dto";
import { AppShell } from "@/components/AppShell";
import { STATUS_LABEL, useTranscriptMessages } from "@/components/DateCall";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { DIFFICULTY_LABEL, sampleTranscript } from "@/client/mockData";
import { useDateConversation } from "@/client/useDateConversation";
import { movesByTurn } from "@/client/liveMoves";
import { getUserId } from "@/client/userId";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createWorldBus, type DateTalk, type WorldBus, type WorldDate } from "@/world/bus";
import { isTyping, MOVE_KEYS } from "@/world/controls";
import { TABLES } from "@/world/layout";

const WorldScene = lazy(() => import("@/world/WorldScene"));

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
  const [talk, setTalk] = useState<DateTalk | null>(null);
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
            <WorldScene personas={list} bus={bus} date={date} nearby={phase.kind === "explore" ? nearby : null} onNearby={setNearby} onReady={onReady} talk={phase.kind === "date" ? talk : null} />
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
            onTalk={setTalk}
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
function DateOverlay({
  sessionId,
  bus,
  onLeave,
  onEnded,
  onTalk,
}: {
  sessionId: string;
  bus: WorldBus;
  onLeave: () => void;
  onEnded: () => void;
  onTalk: (talk: DateTalk | null) => void;
}) {
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
      <DateHud
        session={session as DateSessionDTO & { persona: NonNullable<DateSessionDTO["persona"]> }}
        bus={bus}
        onLeave={onLeave}
        onEnded={onEnded}
        onTalk={onTalk}
      />
    </ConversationProvider>
  );
}

/**
 * The date, played out in the scene: the lines appear as speech bubbles over the two of you (see world/DateBubbles),
 * grades pop over your head, and the screen keeps only a short title at the start and a slim control bar.
 */
function DateHud({
  session,
  bus,
  onLeave,
  onEnded,
  onTalk,
}: {
  session: DateSessionDTO & { persona: NonNullable<DateSessionDTO["persona"]> };
  bus: WorldBus;
  onLeave: () => void;
  onEnded: () => void;
  onTalk: (talk: DateTalk | null) => void;
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

  // What the scene shows over the two of you.
  const moves = useMemo(
    () => movesByTurn(call.transcript, session.transcript, session.moves, session.gradingEnabled),
    [call.transcript, session.transcript, session.moves, session.gradingEnabled],
  );
  const live = call.status === "live";
  const talk = useMemo<DateTalk>(() => {
    const lastOf = (speaker: "agent" | "user") => call.transcript.findLast((t) => t.speaker === speaker)?.text ?? null;
    let grade: DateTalk["grade"] = null;
    for (const [turnIndex, move] of moves) {
      if (move !== "failed" && (!grade || turnIndex > grade.turnIndex)) grade = { turnIndex, move: move.classification };
    }
    return {
      personaLine: lastOf("agent"),
      playerLine: lastOf("user"),
      lastSpeaker: call.transcript.at(-1)?.speaker ?? null,
      personaSpeaking: call.isSpeaking,
      listening: live && !call.isSpeaking && !call.isMuted,
      grade,
    };
  }, [call.transcript, call.isSpeaking, call.isMuted, live, moves]);
  useEffect(() => onTalk(talk), [talk, onTalk]);
  useEffect(() => () => onTalk(null), [onTalk]);

  const messages = useTranscriptMessages(call, session);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const lastTurn = call.transcript.at(-1);
  const paused = call.status === "paused";
  const notStarted = call.status === "idle" || call.status === "connecting";
  const muteLabel = call.isMuted ? "Unmute microphone" : "Mute microphone";

  return (
    <>
      <OpeningTitle title={`Date with ${persona.name}`} subtitle={scenario.setting} />

      {/* The bubbles are canvas overlays that screen readers skip; this reads each new line instead. */}
      <p className="sr-only" aria-live="polite">
        {lastTurn ? `${lastTurn.speaker === "agent" ? persona.name : "You"}: ${lastTurn.text}` : ""}
      </p>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-3 sm:p-6">
        {(call.error || saveError) && (
          <div className="pointer-events-auto w-full max-w-md">
            <Alert tone="danger" title={saveError ? "Couldn't save your date" : "Voice connection problem"}>
              {saveError ?? call.error}
            </Alert>
          </div>
        )}

        <div
          role="toolbar"
          aria-label="Date controls"
          className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/60 p-1.5 text-white shadow-lg backdrop-blur-md"
        >
          <span className="flex h-10 items-center gap-2 px-3 text-sm tabular-nums" aria-live="off">
            <span
              className={cn("size-2 rounded-full", live ? "animate-pulse bg-emerald-400 motion-reduce:animate-none" : paused ? "bg-amber-400" : "bg-white/50")}
              aria-hidden="true"
            />
            {call.status === "connecting" ? "Connecting..." : paused ? `Paused · ${formatDuration(call.elapsedMs / 1000)}` : formatDuration(call.elapsedMs / 1000)}
            <span className="sr-only">{STATUS_LABEL[call.status]}</span>
          </span>

          {notStarted ? (
            <>
              {call.status === "idle" && (
                <button type="button" className={hudPill("bg-white text-neutral-900 hover:bg-white/90")} onClick={() => void call.start()}>
                  <Phone className="size-4" aria-hidden="true" /> Start date
                </button>
              )}
              <button type="button" className={hudPill("hover:bg-white/15")} onClick={onLeave}>
                <ArrowLeft className="size-4" aria-hidden="true" /> Leave the table
              </button>
            </>
          ) : (
            <>
              <HudIconButton label={muteLabel} pressed={call.isMuted} disabled={!live} onClick={call.toggleMute}>
                {call.isMuted ? <MicOff className="size-[18px]" aria-hidden="true" /> : <Mic className="size-[18px]" aria-hidden="true" />}
              </HudIconButton>
              <HudIconButton label={paused ? "Resume" : "Pause"} disabled={!live && !paused} onClick={paused ? call.resume : call.pause}>
                {paused ? <Play className="size-[18px]" aria-hidden="true" /> : <Pause className="size-[18px]" aria-hidden="true" />}
              </HudIconButton>
              <HudIconButton
                label={transcriptOpen ? "Hide transcript" : "Show transcript"}
                pressed={transcriptOpen}
                onClick={() => setTranscriptOpen((o) => !o)}
                aria-controls="world-transcript"
              >
                <MessageSquare className="size-[18px]" aria-hidden="true" />
              </HudIconButton>
              <button type="button" className={hudPill("ml-1 bg-danger hover:brightness-110")} onClick={() => void endDate()} disabled={ending}>
                {ending ? (
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" aria-hidden="true" />
                ) : (
                  <PhoneOff className="size-4" aria-hidden="true" />
                )}
                {ending ? "Saving..." : "End date"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* The full transcript, on demand, over the right edge (full width on phones). */}
      {transcriptOpen && (
        <section
          id="world-transcript"
          aria-label="Transcript"
          className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-border bg-surface shadow-(--shadow-resting) sm:w-[400px]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 className="text-base text-foreground">Transcript</h2>
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
                label="Transcript"
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

const hudFocus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const hudPill = (extra: string) =>
  cn("flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors disabled:opacity-60", hudFocus, extra);

function HudIconButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
  ...aria
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  "aria-controls"?: string;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "grid size-10 place-items-center rounded-full transition-colors hover:bg-white/15 disabled:opacity-40 disabled:hover:bg-transparent",
          pressed && "bg-white/20",
          hudFocus,
        )}
        {...aria}
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** "Date with Maya" over the scene as the two of you sit down, then out of the way. */
function OpeningTitle({ title, subtitle }: { title: string; subtitle: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-4 sm:top-10"
      initial={{ opacity: 0, y: reduce ? 0 : -8 }}
      animate={{ opacity: [0, 1, 1, 0], y: 0 }}
      transition={{ duration: 5, times: [0, 0.12, 0.8, 1] }}
      aria-hidden="true"
    >
      <div className="rounded-2xl bg-black/50 px-5 py-3 text-center text-white backdrop-blur-md">
        <p className="font-heading text-xl">{title}</p>
        <p className="mt-0.5 text-sm text-white/80">{subtitle}</p>
      </div>
    </motion.div>
  );
}

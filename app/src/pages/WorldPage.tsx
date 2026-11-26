import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Captions, CaptionsOff, Check, GraduationCap, MessageSquare, TriangleAlert, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { ConversationProvider } from "@elevenlabs/react";
import { appendTranscript, createDateSession, endDateSession, getCoachingRecap, getDateSession, getPersonas, useQuery } from "wasp/client/operations";
import type { DateSessionDTO, PersonaWithScenario } from "../server/dto";
import type { TranscriptTurn } from "../shared/types";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { reviewNotice, reviewPollMs } from "@/client/results";
import { useFirstRunRedirect } from "@/client/useFirstRun";
import { AppShell } from "@/components/AppShell";
import { AvatarStage } from "@/components/AvatarStage";
import { CallButtons, GradePop, STATUS_LABEL, useTranscriptMessages } from "@/components/DateCall";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { ChatThread } from "@/components/arc/chat-thread/chat-thread";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { coachingDemo, DIFFICULTY_LABEL, sampleTranscript } from "@/client/mockData";
import { useDateConversation } from "@/client/useDateConversation";
import { useAvatarSession } from "@/client/useAvatarSession";
import { getUserId } from "@/client/userId";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createWorldBus, type WorldBus, type WorldDate } from "@/world/bus";
import { isTyping, MOVE_KEYS } from "@/world/controls";
import { COACH_ID, STUDIO, TABLES } from "@/world/layout";
import { subscribeCaption } from "@/world/npcChatter";
import { StudioDialog } from "@/components/StudioDialog";

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
  | { kind: "date"; personaId: string; sessionId: string }
  | { kind: "summary"; session: DateSessionDTO };

/** A walkable plaza. Walk up to someone waiting at a café table and start a practice date right there. */
export function WorldPage() {
  useFirstRunRedirect();
  // Stock personas and this browser's generated characters, which wait at the remaining tables.
  const { data: personas, isLoading, error, refetch: refetchPersonas } = useQuery(getPersonas, { userId: getUserId() });
  const [studioOpen, setStudioOpen] = useState(false);
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

  // E talks to whoever is in reach, or opens the studio when standing at its door.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyE" || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (phase.kind !== "explore" || !nearby || studioOpen) return;
      if (nearby === STUDIO.id) setStudioOpen(true);
      else void startDate(nearby);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase.kind, nearby, startDate, studioOpen]);

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

        {ready && (phase.kind === "explore" || phase.kind === "starting") && !hintDone && <ControlsHint onDone={onHintDone} />}

        {ready && (phase.kind === "explore" || phase.kind === "starting") && (
          <ExploreHud
            persona={phase.kind === "explore" ? nearbyPersona : list.find((p) => p.id === phase.personaId) ?? null}
            studio={phase.kind === "explore" && nearby === STUDIO.id}
            starting={phase.kind === "starting"}
            error={startError}
            onTalk={(id) => void startDate(id)}
            onOpenStudio={() => setStudioOpen(true)}
            onDismissError={() => setStartError(null)}
          />
        )}

        <StudioDialog
          open={studioOpen}
          onOpenChange={setStudioOpen}
          personas={list}
          starting={phase.kind === "starting" ? phase.personaId : null}
          onDate={(id) => { setStudioOpen(false); void startDate(id); }}
          onCharactersChanged={() => void refetchPersonas()}
        />

        {phase.kind === "date" && (
          <DateOverlay
            sessionId={phase.sessionId}
            bus={bus}
            onLeave={() => setPhase({ kind: "explore" })}
            onEnded={(session) => setPhase({ kind: "summary", session })}
          />
        )}

        {phase.kind === "summary" && (phase.session.kind === "coaching" ? (
          <CoachingSummary session={phase.session} onClose={() => setPhase({ kind: "explore" })} />
        ) : (
          <DateSummary
            session={phase.session}
            onClose={() => setPhase({ kind: "explore" })}
          />
        ))}
      </div>
    </AppShell>
  );
}

function LoadingCard() {
  return (
    <div className="absolute inset-0 grid place-items-center p-6">
      <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-3 shadow-(--shadow-resting)" role="status">
        <span className="size-4 animate-spin rounded-full border-2 border-border border-t-brand motion-reduce:animate-none" aria-hidden="true" />
        <span className="text-sm text-foreground">Setting up the plaza…</span>
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
            <Kbd done={walked}>W A S D</Kbd> to walk, <Kbd done={ran}>Shift</Kbd> to run, drag to look.
          </span>
          <span className="hidden [@media(pointer:coarse)]:inline">Tap to walk, drag to look.</span>
        </p>
      </div>
    </div>
  );
}

/** Errors starting a date, and the "Talk to" card when someone is in reach. */
function ExploreHud({
  persona,
  studio,
  starting,
  error,
  onTalk,
  onOpenStudio,
  onDismissError,
}: {
  persona: PersonaWithScenario | null;
  /** Standing at the studio door. */
  studio: boolean;
  starting: boolean;
  error: string | null;
  onTalk: (personaId: string) => void;
  onOpenStudio: () => void;
  onDismissError: () => void;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 sm:p-6">
        <div className="flex w-full max-w-md flex-col gap-3">
          <PasserByCaption />
          {error && (
            <div className="pointer-events-auto">
              <Alert tone="danger" title="Couldn't start the date" onDismiss={onDismissError}>
                {error}
              </Alert>
            </div>
          )}
          {studio && (
            <div className="pointer-events-auto rounded-(--radius-panel) border border-border bg-surface p-4 shadow-(--shadow-resting)" aria-live="polite">
              <p className="text-base font-medium text-foreground">Studio</p>
              <p className="mt-0.5 text-sm text-subtle">Manage your characters and look back at past dates.</p>
              <Button size="lg" className="mt-4 w-full" onClick={onOpenStudio}>
                Open the studio
                <Kbd className="ml-1 border-current/35 bg-current/15 text-current [@media(pointer:coarse)]:hidden">E</Kbd>
              </Button>
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
                  <p className="mt-0.5 line-clamp-2 text-sm text-subtle" title={persona.bio}>{persona.bio}</p>
                </div>
                {persona.id === COACH_ID ? (
                  <Badge size="sm" tone="info" icon={<GraduationCap className="size-3" aria-hidden="true" />}>Coach</Badge>
                ) : (
                  <Badge size="sm" tone={difficultyTone[persona.difficulty]} dot>
                    {DIFFICULTY_LABEL[persona.difficulty]}
                  </Badge>
                )}
              </div>
              <Button size="lg" className="mt-4 w-full" loading={starting} loadingLabel="Starting…" onClick={() => onTalk(persona.id)}>
                Talk to {persona.name}
                <Kbd className="ml-1 border-current/35 bg-current/15 text-current [@media(pointer:coarse)]:hidden">E</Kbd>
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** What a passer-by is saying, captioned like game subtitles while the clip plays. */
function PasserByCaption() {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => subscribeCaption(setLine), []);
  return (
    <div aria-live="polite" className="flex justify-center empty:hidden">
      {line && (
        <p className="rounded-full bg-black/70 px-4 py-1.5 text-center text-sm text-white [text-wrap:balance]">
          <span className="mr-1.5 text-white/70">Passer-by:</span>
          {line}
        </p>
      )}
    </div>
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
}: {
  sessionId: string;
  bus: WorldBus;
  onLeave: () => void;
  onEnded: (session: DateSessionDTO) => void;
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
      <DateStage
        key={session.id}
        session={session as DateSessionDTO & { persona: NonNullable<DateSessionDTO["persona"]> }}
        bus={bus}
        onLeave={onLeave}
        onEnded={onEnded}
      />
    </ConversationProvider>
  );
}

/** Keep the stage available even if the plaza is still loading or rendering slowly. */
const MAX_SIT_MS = 6500;
const PUSH_IN_MS = 1100;

/**
 * The date: you sit down in the plaza, the camera pushes in on the persona's face, and the scene cross-fades into the
 * avatar stage (the same stage as the date page: video or portrait, subtitles, call controls, transcript).
 * Ending the date fades back out to the plaza, where the page shows the summary.
 */
function DateStage({
  session,
  bus,
  onLeave,
  onEnded,
}: {
  session: DateSessionDTO & { persona: NonNullable<DateSessionDTO["persona"]> };
  bus: WorldBus;
  onLeave: () => void;
  onEnded: (session: DateSessionDTO) => void;
}) {
  const { id: sessionId, persona, scenario } = session;
  // Save each turn as it arrives, so a closed tab doesn't lose the date.
  const onTurn = (turn: TranscriptTurn) => {
    appendTranscript({ userId: getUserId(), id: sessionId, turns: [turn] }).catch((err) => console.warn("[world] couldn't save a turn:", err));
  };
  // An Anam video avatar when this server has it configured (real video, lip-synced to the ElevenLabs
  // agent); otherwise ElevenLabs voice-only, or the mock when the session has no agent at all.
  // Both hooks are always called (rules of hooks); only the active one's start()/end() ever run.
  const useAvatar = session.avatarEnabled && Boolean(session.agentId);
  const avatarCall = useAvatarSession({ sessionId, initialTranscript: session.transcript, onTurn });
  const voiceCall = useDateConversation({
    source: session.source,
    sessionId,
    initialTranscript: session.transcript,
    persona,
    scenario,
    agentId: session.agentId,
    userContext: session.userContext,
    sampleTranscript: session.kind === "coaching" ? coachingDemo : sampleTranscript,
    onTurn,
  });
  const call = useAvatar ? avatarCall : voiceCall;

  // The persona's head and chest follow their voice (seen during the push-in).
  useEffect(() => {
    bus.voice = call.getOutputVolume;
    return () => {
      bus.voice = () => 0;
    };
  }, [bus, call.getOutputVolume]);

  // Sit, push in, then fade the stage in. With reduced motion the stage appears at once.
  const reduce = useReducedMotion();
  const [onStage, setOnStage] = useState(false);

  // The call starts once you're both seated and the stage is up, so the date never starts talking while still
  // walking to the table. The stage shows their portrait while connecting and their video once it plays.
  const started = useRef(false);
  useEffect(() => {
    if (!onStage || started.current) return;
    started.current = true;
    void call.start();
  }, [call, onStage]);
  useEffect(() => {
    if (reduce) {
      setOnStage(true);
      return;
    }
    const started = performance.now();
    let frame = 0;
    let show: number | undefined;
    const waitForSeats = (now: number) => {
      if ((bus.seated.player && bus.seated.persona) || now - started >= MAX_SIT_MS) {
        bus.closeUp = true;
        show = window.setTimeout(() => setOnStage(true), PUSH_IN_MS);
      } else {
        frame = window.requestAnimationFrame(waitForSeats);
      }
    };
    frame = window.requestAnimationFrame(waitForSeats);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(show);
      bus.closeUp = false;
    };
  }, [bus, reduce]);

  const [ending, setEnding] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  async function endDate() {
    setEnding(true);
    try {
      const transcript = await call.end();
      const completed = await endDateSession({ userId: getUserId(), id: sessionId, transcript });
      bus.closeUp = false;
      onEnded(completed);
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
  const lastTurn = call.transcript.at(-1);
  const hint = live && call.isMuted ? "You're muted" : null;

  return (
    <>
      {/* Until the stage covers the plaza: who you're meeting, and a way out if the call never starts. */}
      {!onStage && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-6">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border bg-surface/90 py-2 pl-4 pr-2 shadow-(--shadow-resting) backdrop-blur-md">
            <span className="text-sm text-foreground">Sitting down with {persona.name}…</span>
            {call.status === "idle" && (
              <Button size="sm" variant="ghost" onClick={onLeave}>
                Leave
              </Button>
            )}
          </div>
        </div>
      )}

      <motion.div
        className="absolute inset-0 z-10"
        initial={false}
        animate={{ opacity: onStage ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.7, ease: "easeInOut" }}
        style={{ pointerEvents: onStage ? "auto" : "none" }}
        aria-hidden={!onStage}
      >
        {/* Beside the transcript rather than under it, so the avatar and controls center in the space left over. */}
        <div className={cn("absolute inset-y-0 left-0 right-0", transcriptOpen && "sm:right-[400px]")}>
          <AvatarStage
            persona={persona}
            stream={call.videoStream}
            attach={useAvatar ? avatarCall.attach : undefined}
            videoReady={useAvatar ? avatarCall.videoReady : undefined}
            speaking={call.isSpeaking}
            volume={call.getOutputVolume}
            className="size-full rounded-none border-0 shadow-none"
            // Clear of the name panel above and the call controls below.
            frameClassName="px-4 pt-32 pb-24 sm:px-6"
            overlay={
              <>
                <GradePop call={call} session={session} />
                {/* Same column as the top bar (AppShell's header: max-w-6xl, px-4 sm:px-6). */}
                <div className="absolute inset-x-0 top-0 mx-auto flex max-w-6xl items-start justify-between gap-3 px-4 py-4 sm:px-6">
                  {/* Frosted like the call controls, so the name reads over any frame of the video. */}
                  <div className="min-w-0 rounded-(--radius-panel) border border-border bg-background/85 px-3 py-2 backdrop-blur-md">
                    <p className="font-heading text-lg text-foreground">
                      {persona.name}, {persona.age}
                    </p>
                    <p className="truncate text-sm text-subtle">{scenario.setting}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge size="sm" tone={live ? "success" : call.status === "paused" ? "warning" : "neutral"} dot pill>
                        {session.source === "demo" && "Demo · "}{STATUS_LABEL[call.status]}
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
                  <div className="flex shrink-0 items-center gap-2">
                    <Tooltip content={subtitles ? "Hide subtitles" : "Show subtitles"}>
                      <Button size="sm" variant="secondary" onClick={toggleSubtitles} aria-pressed={subtitles} aria-label="Subtitles">
                        {subtitles ? <Captions className="size-4" aria-hidden="true" /> : <CaptionsOff className="size-4" aria-hidden="true" />}
                      </Button>
                    </Tooltip>
                    <Button size="sm" variant="secondary" onClick={() => setTranscriptOpen((o) => !o)} aria-label="Transcript" aria-expanded={transcriptOpen} aria-controls="world-transcript">
                      <MessageSquare className="size-4" aria-hidden="true" />
                      <span className="hidden sm:inline">Transcript</span>
                    </Button>
                  </div>
                </div>

                <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 p-4 sm:p-6">
                  {subtitles && lastTurn && (
                    <p className="mb-3 max-w-2xl rounded-lg bg-black/70 px-3 py-1.5 text-center text-sm text-white sm:text-base" aria-hidden="true">
                      <span className="font-medium">{lastTurn.speaker === "agent" ? persona.name : "You"}:</span> {lastTurn.text}
                    </p>
                  )}
                  {(call.error || saveError) && (
                    <div className="w-full max-w-md">
                      <Alert tone="danger" title={saveError ? "Couldn't save your date" : "Voice connection problem"}>
                        {saveError ?? call.error}
                      </Alert>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2 rounded-[calc(var(--radius-control)+9px)] border border-border bg-background/85 p-2 backdrop-blur-md">
                    <CallButtons call={call} coaching={session.kind === "coaching"} ending={ending} onEnd={() => void endDate()} />
                    {call.status === "idle" && (
                      <Button size="lg" variant="ghost" onClick={onLeave}>
                        <ArrowLeft className="size-4" aria-hidden="true" /> Back to the plaza
                      </Button>
                    )}
                  </div>
                </div>
              </>
            }
          />
        </div>

        {/* The full transcript with grades, on demand, over the right edge (full width on phones). */}
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
      </motion.div>
    </>
  );
}

/** After a coaching chat: what went well, what to work on, and one thing to try next, written from the conversation. */
function CoachingSummary({ session, onClose }: { session: DateSessionDTO; onClose: () => void }) {
  const navigate = useNavigate();
  const { data: recap, isLoading } = useQuery(getCoachingRecap, { userId: getUserId(), id: session.id });
  const notice = reviewNotice(session);
  const coach = session.persona?.name ?? "your coach";
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title={notice.title} description={recap ? `Your takeaways from talking with ${coach}.` : notice.description}>
        {isLoading ? (
          <Skeleton label="Writing your recap" lines={4} />
        ) : recap && (
          <div className="grid gap-4 text-sm">
            <RecapList title="What went well" items={recap.wentWell} />
            <RecapList title="What to work on" items={recap.workOn} />
            <p className="text-foreground"><strong>Next time </strong>{recap.nextStep}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => navigate(routes.FeedbackRoute.build({ params: { sessionId: session.id } }))}>View conversation</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecapList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="grid gap-1.5">
      <h3 className="font-medium text-foreground">{title}</h3>
      <ul className="grid list-disc gap-1 pl-5 text-subtle marker:text-faint">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function DateSummary({ session: ended, onClose }: { session: DateSessionDTO; onClose: () => void }) {
  const navigate = useNavigate();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  // The review finishes in the background after the date ends. The summary fills in when it is ready.
  const { data } = useQuery(getDateSession, { userId: getUserId(), id: ended.id }, {
    initialData: ended,
    refetchInterval: (latest: DateSessionDTO | undefined) => reviewPollMs(latest),
  });
  const session = data ?? ended;
  const { review, persona } = session;
  const notice = reviewNotice(session);
  const score = review?.overallScore ?? null;
  const strength = review?.strengths[0];
  const weakness = review?.weaknesses[0];
  const hasDetails = Boolean(strength || weakness || review?.practice);
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent title={review ? `How it went with ${persona?.name ?? "your date"}` : notice.title}
        description={review ? undefined : notice.description}>
        <div className="grid gap-6">
          {review && (
            <div className="grid gap-3">
              {score != null && <ScoreMeter score={score} />}
              <p className={cn("text-sm text-subtle", score != null && "text-center")}>{review.summary}</p>
            </div>
          )}
          <div className="grid gap-2">
            {hasDetails && (
              <>
                <Button variant="secondary" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen(!detailsOpen)}>
                  {detailsOpen ? "Hide details" : "See details"}
                </Button>
                <div id={detailsId} hidden={!detailsOpen}>
                  <ul className="grid gap-3 border-y border-border py-4 text-sm text-foreground">
                    {strength && (
                      <li className="flex gap-2.5">
                        <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                        <p>{strength.point}</p>
                      </li>
                    )}
                    {weakness && (
                      <li className="flex gap-2.5">
                        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                        <p>{weakness.point}</p>
                      </li>
                    )}
                    {review?.practice && (
                      <li className="flex gap-2.5">
                        <GraduationCap className="mt-0.5 size-4 shrink-0 text-subtle" aria-hidden="true" />
                        <p><strong>Next time </strong>{review.practice.instruction}</p>
                      </li>
                    )}
                  </ul>
                </div>
              </>
            )}
            <Button onClick={() => navigate(routes.FeedbackRoute.build({ params: { sessionId: session.id } }))}>
              {review ? "Open date review" : "View conversation"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The overall score as a 270 degree ring. */
function ScoreMeter({ score }: { score: number }) {
  const arc = (score / 100) * 270;
  return (
    <div className="flex justify-center">
      <div
        role="meter"
        aria-label="Overall date score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score} out of 100`}
        className="relative grid size-44 place-items-center sm:size-48"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 225deg, var(--accent) 0deg ${arc}deg, var(--border) ${arc}deg 270deg, transparent 270deg)`,
            maskImage: "radial-gradient(farthest-side, transparent calc(100% - 10px), #000 calc(100% - 9px))",
          }}
        />
        <div aria-hidden="true" className="-mt-2 grid justify-items-center">
          <span className="text-sm text-subtle">Overall score</span>
          <span className="font-heading text-6xl leading-none font-medium tabular-nums text-foreground">{score}</span>
          <span className="mt-1 text-sm text-subtle">out of 100</span>
        </div>
      </div>
    </div>
  );
}

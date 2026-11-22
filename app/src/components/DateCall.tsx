import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion, type MotionProps } from "motion/react";
import { Mic, MicOff, Pause, Phone, PhoneOff, Play } from "lucide-react";
import { MOVE_LABEL, MoveBadge } from "@/components/MoveReview";
import { Button } from "@/components/arc/button/button";
import type { ChatMessage } from "@/components/arc/chat-thread/chat-thread";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { movesByTurn } from "@/client/liveMoves";
import { cn } from "@/lib/utils";
import type { ConversationStatus, DateConversation } from "@/client/useDateConversation";
import type { DateSessionDTO } from "../server/dto";
import type { MoveClass } from "../shared/types";

/** Call controls and transcript plumbing shared by the date page and the in-world date. */

export const STATUS_LABEL: Record<ConversationStatus, string> = {
  idle: "Ready when you are!",
  connecting: "Connecting...",
  live: "Live",
  paused: "Paused",
  ended: "Date over",
};

/** Start, or Mute + Pause + End once the date is on. */
export function CallButtons({ call, ending, onEnd }: { call: DateConversation; ending: boolean; onEnd: () => void }) {
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

/**
 * The call's transcript as Arc ChatThread messages, with a grade badge under each graded reply.
 * appendTranscript grades each saved reply and Wasp refetches getDateSession after it, so `session.moves` fills in live.
 */
export function useTranscriptMessages(call: DateConversation, session: DateSessionDTO) {
  const moves = useMemo(
    () => movesByTurn(call.transcript, session.transcript, session.moves, session.gradingEnabled),
    [call.transcript, session.transcript, session.moves, session.gradingEnabled],
  );

  // Arc ChatThread wants absolute times; anchor turn offsets to a fixed start.
  const [anchor] = useState(() => Date.now());
  return useMemo<ChatMessage[]>(
    () =>
      call.transcript.map((turn, i) => {
        const move = moves.get(i);
        return {
          id: `${i}`,
          authorId: turn.speaker,
          text: turn.text,
          createdAt: anchor + turn.timestamp,
          annotation:
            move === "failed" ? (
              <span className="text-xs text-faint">Couldn't grade this reply</span>
            ) : move ? (
              <MoveBadge move={move.classification} />
            ) : undefined,
        };
      }),
    [call.transcript, anchor, moves],
  );
}

/** One line of coaching per grade, shown with the pop so a bare label isn't a riddle. */
const MOVE_HINT: Record<MoveClass, string> = {
  great: "You built on what they said and moved things forward.",
  good: "Nice, that keeps the conversation going.",
  neutral: "Fine. A detail about you or a follow-up question would lift it.",
  inaccuracy: "They gave you an opening there. Pick it up next time.",
  mistake: "That one landed awkwardly. Bring it back to them.",
  blunder: "Ouch. That could end the date. Try to repair it.",
};

/**
 * How hard each grade hits. The extremes are loud (great moves celebrate, blunders alarm), the solid middle is a
 * medium pop, and the in-between grades stay a quiet note so they don't interrupt the conversation.
 */
type Tier = "loud" | "medium" | "quiet";

/**
 * The pop's look per grade, after chess.com's move icons: a glyph medallion in a vivid color and a headline.
 * Colors are the 600 shades so white glyphs keep 3:1 contrast at this size.
 */
const POP_STYLE: Record<MoveClass, { headline: string; glyph: string; color: string; tier: Tier }> = {
  great: { headline: "Great move!", glyph: "!!", color: "#16a34a", tier: "loud" },
  good: { headline: "Good move", glyph: "!", color: "#0d9488", tier: "medium" },
  neutral: { headline: "Okay", glyph: "=", color: "#64748b", tier: "quiet" },
  inaccuracy: { headline: "Inaccuracy", glyph: "?!", color: "#d97706", tier: "quiet" },
  mistake: { headline: "Mistake", glyph: "?", color: "#ea580c", tier: "medium" },
  blunder: { headline: "Blunder!", glyph: "??", color: "#dc2626", tier: "loud" },
};

/** How long a pop holds before it clears; the conversation keeps going underneath. */
const POP_MS: Record<Tier, number> = { loud: 3000, medium: 2400, quiet: 2200 };
const CONFETTI = 22;

/**
 * Pops the grade of each reply across the call screen as it lands, as loud as the grade: see POP_STYLE.
 * Shows only grades for replies from this call, each one once. Render it as a direct child of a positioned stage.
 */
export function GradePop({ call, session }: { call: DateConversation; session: DateSessionDTO }) {
  const moves = useMemo(
    () => movesByTurn(call.transcript, session.transcript, session.moves, session.gradingEnabled),
    [call.transcript, session.transcript, session.moves, session.gradingEnabled],
  );
  const latest = useMemo(() => {
    let best: { turnIndex: number; move: MoveClass } | null = null;
    for (const [turnIndex, move] of moves) {
      if (move !== "failed" && (!best || turnIndex > best.turnIndex)) best = { turnIndex, move: move.classification };
    }
    return best;
  }, [moves]);

  // Each grade shows for its tier's time, starting when it arrives.
  const [visible, setVisible] = useState<number | null>(null);
  const turnIndex = latest?.turnIndex;
  const tier = latest ? POP_STYLE[latest.move].tier : null;
  useEffect(() => {
    if (turnIndex === undefined || tier === null) return;
    setVisible(turnIndex);
    const timer = window.setTimeout(
      () => setVisible((v) => (v === turnIndex ? null : v)),
      POP_MS[tier],
    );
    return () => window.clearTimeout(timer);
  }, [turnIndex, tier]);

  const reduce = useReducedMotion() ?? false;
  const shown = latest && visible === latest.turnIndex ? latest : null;
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {shown ? `Your reply: ${MOVE_LABEL[shown.move]}. ${MOVE_HINT[shown.move]}` : ""}
      </p>
      <AnimatePresence>
        {shown &&
          (POP_STYLE[shown.move].tier === "quiet" ? (
            <QuietPop key={shown.turnIndex} move={shown.move} reduce={reduce} />
          ) : (
            <Pop key={shown.turnIndex} move={shown.move} reduce={reduce} />
          ))}
      </AnimatePresence>
    </>
  );
}

/** A note that slides up just above the call controls, for the in-between grades. */
function QuietPop({ move, reduce }: { move: MoveClass; reduce: boolean }) {
  const { headline, glyph, color } = POP_STYLE[move];
  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-36 z-20 flex justify-center px-4 sm:bottom-40"
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduce ? 0 : -8 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
    >
      <div className="flex max-w-md items-center gap-3 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-4 shadow-(--shadow-resting)">
        <span className="grid size-8 shrink-0 place-items-center rounded-full font-heading text-sm font-bold text-white" style={{ backgroundColor: color }}>
          {glyph}
        </span>
        <span className="text-sm">
          <span className="font-medium text-foreground">
            {headline}
          </span>
          <span className="text-subtle"> · {MOVE_HINT[move]}</span>
        </span>
      </div>
    </motion.div>
  );
}

/** Movement follows the grade's intensity and stays still under reduced motion. */
function popMovement(move: MoveClass, reduce: boolean): MotionProps {
  const loud = POP_STYLE[move].tier === "loud";
  const bad = move === "mistake" || move === "blunder";
  const spring = { type: "spring", stiffness: loud ? 460 : 380, damping: loud ? 13 : 18 } as const;
  const shake = move === "blunder" ? [0, -22, 18, -14, 10, -6, 0] : move === "mistake" ? [0, -8, 6, -3, 0] : undefined;
  return {
    initial: reduce ? false : { y: 24 },
    animate: reduce ? undefined : { y: 0, x: shake },
    exit: reduce ? undefined : { y: bad ? 28 : -36, transition: { duration: 0.35, ease: "easeIn" } },
    transition: shake ? { x: { duration: move === "blunder" ? 0.55 : 0.35, delay: 0.15 }, y: spring } : spring,
  };
}

/** The center-stage pop for good and bad moves, scaled up for the extremes. */
function Pop({ move, reduce }: { move: MoveClass; reduce: boolean }) {
  const { headline, color, tier } = POP_STYLE[move];
  const loud = tier === "loud";
  const spring = { type: "spring", stiffness: loud ? 460 : 380, damping: loud ? 13 : 18 } as const;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35 } }}
      transition={{ duration: 0.12 }}
    >
      <GradeWash move={move} reduce={reduce} />

      <motion.div
        className="relative flex -translate-y-6 flex-col items-center px-6 text-center"
        {...popMovement(move, reduce)}
      >
        <GradeMedallion move={move} reduce={reduce} />

        <motion.p
          className={cn(
            "font-heading font-semibold tracking-tight drop-shadow-[0_2px_0_rgba(255,255,255,0.85)]",
            loud ? "mt-6 text-6xl sm:text-8xl" : "mt-4 text-4xl sm:text-5xl",
          )}
          style={{ color }}
          initial={reduce ? false : { scale: loud ? 0.5 : 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...spring, delay: reduce ? 0 : 0.08 }}
        >
          {headline}
        </motion.p>
        <motion.p
          className="mt-3 max-w-md rounded-full bg-black/70 px-4 py-1.5 text-sm text-white backdrop-blur-sm sm:text-base"
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: reduce ? 0 : 0.22 }}
        >
          {MOVE_HINT[move]}
        </motion.p>
      </motion.div>
    </motion.div>
  );
}

/** A wash behind the feedback, with a stronger edge pulse for a blunder. */
function GradeWash({ move, reduce }: { move: MoveClass; reduce: boolean }) {
  const { color, tier } = POP_STYLE[move];
  const loud = tier === "loud";
  return (
    <>
      {/* Color flash: a wash of the grade's color that blooms out and settles. */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 45%, ${color}${loud ? "66" : "33"} 0%, ${color}${loud ? "26" : "12"} 38%, transparent 72%)`,
        }}
        initial={{ opacity: 0, scale: reduce ? 1 : 0.6 }}
        animate={{ opacity: loud ? [0, 1, 0.6] : [0, 0.9, 0.45], scale: 1 }}
        transition={{ duration: reduce ? 0.2 : 0.7, ease: "easeOut" }}
      />
      {/* A blunder pulses red at the screen edges, like taking damage. */}
      {move === "blunder" && (
        <motion.div
          className="absolute inset-0"
          style={{ boxShadow: `inset 0 0 140px 30px ${color}99` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: reduce ? 0.6 : [0, 1, 0.35, 0.8, 0.4] }}
          transition={{ duration: reduce ? 0.2 : 1.1, ease: "easeOut" }}
        />
      )}
    </>
  );
}

/** The grade glyph, its rings, and the celebration for a great reply. */
function GradeMedallion({ move, reduce }: { move: MoveClass; reduce: boolean }) {
  const { glyph, color, tier } = POP_STYLE[move];
  const loud = tier === "loud";
  const bad = move === "mistake" || move === "blunder";
  const spring = { type: "spring", stiffness: loud ? 460 : 380, damping: loud ? 13 : 18 } as const;
  return (
    <div className="relative grid place-items-center">
      {/* Shockwave rings: two for the extremes. */}
      {!reduce &&
        (loud ? [0, 0.18] : [0]).map((delay) => (
          <motion.span
            key={delay}
            className={cn("absolute rounded-full border-4", loud ? "size-32 sm:size-36" : "size-20 sm:size-24")}
            style={{ borderColor: color }}
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: loud ? 2.8 : 2, opacity: 0 }}
            transition={{ duration: loud ? 0.9 : 0.7, ease: "easeOut", delay }}
          />
        ))}
      {!reduce && move === "great" && <Confetti color={color} />}
      <motion.span
        className={cn(
          "grid place-items-center rounded-full font-heading font-bold text-white shadow-[0_12px_40px_-8px_rgba(0,0,0,0.45)] ring-4 ring-white",
          loud ? "size-28 text-6xl sm:size-36 sm:text-7xl" : "size-20 text-4xl sm:size-24 sm:text-5xl",
        )}
        style={{ backgroundColor: color }}
        initial={reduce ? false : { scale: 0.2, rotate: bad ? 25 : -25 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={spring}
      >
        {glyph}
      </motion.span>
    </div>
  );
}

/** Dots that burst out of the medallion and fall away. */
function Confetti({ color }: { color: string }) {
  const palette = [color, "#facc15", "#f472b6", "#38bdf8", "#ffffff"];
  return (
    <>
      {Array.from({ length: CONFETTI }, (_, i) => {
        const angle = (i / CONFETTI) * Math.PI * 2 + (i % 2 ? 0.2 : -0.1);
        const distance = 110 + (i % 3) * 38;
        return (
          <motion.span
            key={i}
            className={i % 3 === 0 ? "absolute h-3 w-1.5 rounded-sm" : "absolute size-2.5 rounded-full"}
            style={{ backgroundColor: palette[i % palette.length] }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: [0, Math.sin(angle) * distance - 20, Math.sin(angle) * distance + 60],
              opacity: [1, 1, 0],
              rotate: i % 2 ? 220 : -180,
            }}
            transition={{ duration: 1.1, ease: "easeOut", delay: 0.05 }}
          />
        );
      })}
    </>
  );
}

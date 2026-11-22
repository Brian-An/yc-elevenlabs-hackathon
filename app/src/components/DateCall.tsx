import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mic, MicOff, Pause, Phone, PhoneOff, Play } from "lucide-react";
import { MOVE_LABEL, MoveBadge } from "@/components/MoveReview";
import { Button } from "@/components/arc/button/button";
import type { ChatMessage } from "@/components/arc/chat-thread/chat-thread";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { movesByTurn } from "@/client/liveMoves";
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

const POP_MS = 4500;

/**
 * Pops the grade of each reply onto the call screen as it lands, then fades it out after a few seconds.
 * Shows only grades for replies from this call, newest first, and each one once.
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

  // Each grade shows for POP_MS, starting when it arrives.
  const [visible, setVisible] = useState<number | null>(null);
  useEffect(() => {
    if (!latest) return;
    setVisible(latest.turnIndex);
    const timer = window.setTimeout(() => setVisible((v) => (v === latest.turnIndex ? null : v)), POP_MS);
    return () => window.clearTimeout(timer);
  }, [latest?.turnIndex]);

  const reduce = useReducedMotion();
  const shown = latest && visible === latest.turnIndex ? latest : null;
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {shown ? `Your reply: ${MOVE_LABEL[shown.move]}. ${MOVE_HINT[shown.move]}` : ""}
      </p>
      <AnimatePresence>
        {shown && (
          <motion.div
            key={shown.turnIndex}
            aria-hidden="true"
            initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : -6 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: "easeOut" }}
            className="flex max-w-md items-center gap-3 rounded-full border border-border bg-surface py-2 pl-2 pr-4 shadow-(--shadow-resting)"
          >
            <MoveBadge move={shown.move} />
            <span className="text-sm text-foreground">{MOVE_HINT[shown.move]}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

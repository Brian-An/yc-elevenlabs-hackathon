import { useMemo, useState } from "react";
import { Mic, MicOff, Pause, Phone, PhoneOff, Play } from "lucide-react";
import { MoveBadge } from "@/components/MoveReview";
import { Button } from "@/components/arc/button/button";
import type { ChatMessage } from "@/components/arc/chat-thread/chat-thread";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { movesByTurn } from "@/client/liveMoves";
import type { ConversationStatus, DateConversation } from "@/client/useDateConversation";
import type { DateSessionDTO } from "../server/dto";

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

import type { MoveClass, MoveEvaluation, Transcript } from "../shared/types";
import { Panel, PanelHeader } from "@/components/Panel";
import { Badge, type BadgeColor, type BadgeTone } from "@/components/arc/badge/badge";
import { cn } from "@/lib/utils";

// Chess annotation glyphs, best move first. Neutral has no glyph, as in chess.
const MOVE: Record<MoveClass, { label: string; glyph?: string; tone?: BadgeTone; color?: BadgeColor }> = {
  great: { label: "Great", glyph: "!!", tone: "success" },
  good: { label: "Good", glyph: "!", color: "teal" },
  neutral: { label: "Neutral", tone: "neutral" },
  inaccuracy: { label: "Inaccuracy", glyph: "?!", color: "amber" },
  mistake: { label: "Mistake", glyph: "?", tone: "warning" },
  blunder: { label: "Blunder", glyph: "??", tone: "danger" },
};
const ORDER = Object.keys(MOVE) as MoveClass[];

/** Plain-text label per grade, for screen readers and anywhere a badge doesn't fit. */
export const MOVE_LABEL = Object.fromEntries(ORDER.map((m) => [m, MOVE[m].label])) as Record<MoveClass, string>;

export function MoveBadge({ move, count }: { move: MoveClass; count?: number }) {
  const { label, glyph, tone, color } = MOVE[move];
  return (
    <Badge size="sm" pill tone={tone} color={color}>
      {glyph && (
        <span className="font-semibold tabular-nums" aria-hidden="true">
          {glyph}
        </span>
      )}
      {count !== undefined ? `${count} ${label}` : label}
    </Badge>
  );
}

/** Low-confidence decisions stay available for calibration and do not become advice. */
export function hasClearGrade(move: MoveEvaluation): boolean {
  return !move.decision || move.decision.probabilities[move.decision.rawLabel] >= 0.5;
}

/** The date's transcript with Jev's grade beside each of the user's replies. */
export function MoveReview({ transcript, moves, personaName }: { transcript: Transcript; moves: MoveEvaluation[]; personaName: string }) {
  const byTurn = new Map(moves.map((m) => [m.turnIndex, m]));
  const counts = ORDER.map((c) => [c, moves.filter((m) => hasClearGrade(m) && m.classification === c).length] as const).filter(([, n]) => n > 0);

  return (
    <Panel id="move-review">
      <PanelHeader
        title="Move by move"
        description="How each reply landed, as estimated by an AI coach."
      />
      {transcript.length === 0 ? (
        <p className="text-sm text-subtle">
          There are no saved replies for this conversation.
        </p>
      ) : (
        <>
          {counts.length > 0 && <ul className="mb-4 flex flex-wrap gap-2" aria-label="Your replies by grade">
            {counts.map(([c, n]) => (
              <li key={c}>
                <MoveBadge move={c} count={n} />
              </li>
            ))}
          </ul>}
          <ol className="grid gap-3">
            {transcript.map((turn, i) => {
              const move = byTurn.get(i);
              const mine = turn.speaker === "user";
              return (
                <li
                  key={i}
                  className={cn(
                    "flex flex-col gap-2 rounded-(--radius-control) px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4",
                    mine ? "bg-surface-muted" : "",
                  )}
                >
                  <p className="min-w-0 text-sm">
                    <span className={cn("font-medium", mine ? "text-foreground" : "text-subtle")}>
                      {mine ? "You" : personaName}:
                    </span>{" "}
                    <span className={mine ? "text-foreground" : "text-subtle"}>{turn.text}</span>
                  </p>
                  {move && hasClearGrade(move) && (
                    <span className="shrink-0">
                      <MoveBadge move={move.classification} />
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </Panel>
  );
}

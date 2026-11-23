import { motion, useReducedMotion } from "motion/react";
import type { SkillName } from "../shared/types";
import { SKILLS } from "@/client/mockData";
import type { SkillScores as Scores } from "@/client/results";
import { cn } from "@/lib/utils";

function toneFor(score: number) {
  if (score >= 7) return "var(--success)";
  if (score >= 5) return "var(--accent)";
  return "var(--warning)";
}

/** Scores are 1 to 10. Shows a bar per skill, with an optional change since last time. */
export function SkillScoreList({ scores, delta, previous, className }: { scores: Scores; delta?: Partial<Record<SkillName, number>>; previous?: Scores; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <ul className={cn("grid gap-4", className)}>
      {SKILLS.map(({ key, label, hint }) => {
        const score = scores[key];
        if (score === undefined) return <li key={key} className="text-sm text-subtle">{label} · Not assessed</li>;
        const prior = previous?.[key];
        const change = delta?.[key] ?? (prior !== undefined ? score - prior : undefined);
        return (
          <li key={key}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{label}</span>
              <span className="flex items-baseline gap-2 text-sm tabular-nums">
                {change !== undefined && change !== 0 && (
                  <span className={change > 0 ? "text-success" : "text-danger"}>
                    {change > 0 ? "+" : ""}
                    {change}
                  </span>
                )}
                <span className="font-medium text-foreground">{score}</span>
                <span className="text-faint">/10</span>
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-surface-muted"
              role="meter"
              aria-label={label}
              aria-valuemin={1}
              aria-valuemax={10}
              aria-valuenow={score}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: toneFor(score) }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${score * 10}%` }}
                transition={{ type: "spring", stiffness: 120, damping: 22 }}
              />
            </div>
            <p className="mt-1 text-xs text-faint">{hint}</p>
          </li>
        );
      })}
    </ul>
  );
}

/** A compact grid of the four scores, for headers. */
export function SkillScoreGrid({ scores, previous }: { scores: Scores; previous?: Scores }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {SKILLS.map(({ key, label }) => {
        const score = scores[key];
        const prior = previous?.[key];
        const change = score !== undefined && prior !== undefined ? score - prior : 0;
        return (
          <div key={key} className="rounded-(--radius-control) border border-border bg-surface p-4">
            <dt className="text-xs text-subtle">{label}</dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
              <span className="font-heading text-3xl font-medium tabular-nums" style={{ color: score === undefined ? undefined : toneFor(score) }}>
                {score ?? <span className="text-sm text-subtle">Not assessed</span>}
              </span>
              {score !== undefined && <span className="text-sm text-faint">/10</span>}
              {change !== 0 && (
                <span className={cn("ml-auto text-xs tabular-nums", change > 0 ? "text-success" : "text-danger")}>
                  {change > 0 ? "+" : ""}
                  {change}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

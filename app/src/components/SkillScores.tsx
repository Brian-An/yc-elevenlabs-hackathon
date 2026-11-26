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

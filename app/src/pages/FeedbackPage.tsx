import { useState } from "react";
import { ArrowRight, Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { routes } from "wasp/client/router";
import type { EvidencedPoint } from "../shared/types";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { MoveReview } from "@/components/MoveReview";
import { SkillScoreGrid } from "@/components/SkillScores";
import { Button } from "@/components/arc/button/button";
import Toast from "@/components/arc/toast/toast";
import { SKILLS, getMockFeedback, personaFor } from "@/client/mockData";
import { formatDate, formatDuration } from "@/lib/format";

export function FeedbackPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  // Swap for: const { data: feedback, isLoading } = useQuery(getFeedback, { sessionId })
  const feedback = getMockFeedback(sessionId);
  const [savedToast, setSavedToast] = useState(true);

  const { session, evaluation, transcript, moves, previousScores, nextScenario } = feedback;
  const nextPersona = personaFor(nextScenario);
  const target = SKILLS.find((s) => s.key === nextScenario.targetWeakness);

  function practiceNext() {
    // TODO(backend): const { id } = await createSession({ scenarioId: nextScenario.id })
    navigate(routes.DateRoute.build({ params: { sessionId: `s-new-${nextScenario.id}` } }));
  }

  return (
    <AppShell wide>
      <PageHeader
        title="How your date went"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {session.persona.name} · {session.scenario.setting} · {formatDate(session.startedAt)}
            {session.durationSec ? ` · ${formatDuration(session.durationSec)}` : ""}
          </span>
        }
        action={
          <Button variant="secondary" onClick={() => navigate(routes.DashboardRoute.build())}>
            Back to dashboard
          </Button>
        }
      />

      <SkillScoreGrid scores={evaluation.scores} previous={previousScores} />

      <Panel className="mt-6">
        <PanelHeader title="Summary" />
        <p className="max-w-prose text-base text-subtle">{evaluation.summary}</p>
      </Panel>

      <div className="mt-6">
        <MoveReview transcript={transcript} moves={moves} personaName={session.persona.name} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="What went well" />
          <PointList points={evaluation.strengths} kind="strength" />
        </Panel>
        <Panel>
          <PanelHeader title="What to work on" />
          <PointList points={evaluation.weaknesses} kind="weakness" />
        </Panel>
      </div>

      {/* Targeted follow-up date */}
      <Panel className="mt-6 border-brand/30 bg-brand-subtle/40">
        <div className="flex flex-col gap-5 md:flex-row md:items-center">
          <PersonaAvatar persona={nextPersona} size={48} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg text-foreground">Practice this next</h2>
            <p className="mt-0.5 text-sm text-subtle">
              {nextPersona.name}
              {target && ` · works on your ${target.label.toLowerCase()}`}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" onClick={practiceNext}>
              Start this date <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              onClick={() => navigate(routes.DateRoute.build({ params: { sessionId: `s-retry-${session.scenario.id}` } }))}
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Retry this one
            </Button>
          </div>
        </div>
      </Panel>

      <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96">
        <Toast
          open={savedToast}
          onOpenChange={setSavedToast}
          title="Saved to your memory"
          description="Your next dates will build on this feedback."
        />
      </div>
    </AppShell>
  );
}

function PointList({ points, kind }: { points: EvidencedPoint[]; kind: "strength" | "weakness" }) {
  const Icon = kind === "strength" ? Check : TriangleAlert;
  return (
    <ul className="grid gap-5">
      {points.map((p) => (
        <li key={p.point} className="flex gap-3">
          <span
            className={
              kind === "strength"
                ? "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-success/15 text-success"
                : "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-warning/15 text-warning"
            }
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm text-foreground">{p.point}</p>
            <blockquote className="mt-2 rounded-(--radius-control) bg-surface-muted px-3.5 py-2.5 text-sm text-subtle">
              "{p.quote}"
            </blockquote>
          </div>
        </li>
      ))}
    </ul>
  );
}

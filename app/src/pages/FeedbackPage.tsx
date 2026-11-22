import { useState } from "react";
import { ArrowRight, Check, RotateCcw, TriangleAlert } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { routes } from "wasp/client/router";
import { createDateSession, endDateSession, getDateSession, getNextScenario, getPersonas, listDateSessions, useQuery } from "wasp/client/operations";
import type { EvidencedPoint, Persona, Scenario } from "../shared/types";
import type { DateSessionDTO, DateSessionSummary, PersonaWithScenario } from "../server/dto";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { MoveReview } from "@/components/MoveReview";
import { SkillScoreGrid } from "@/components/SkillScores";
import { Button } from "@/components/arc/button/button";
import Toast from "@/components/arc/toast/toast";
import { SKILLS } from "@/client/mockData";
import { getUserId } from "@/client/userId";
import { previousScores as scoresBefore } from "@/client/results";
import { Alert } from "@/components/arc/alert/alert";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { formatDate, formatDuration } from "@/lib/format";

export function FeedbackPage() {
  const { sessionId = "" } = useParams();
  const navigate = useNavigate();
  const userId = getUserId();
  const sessionQuery = useQuery(getDateSession, { userId, id: sessionId });
  const historyQuery = useQuery(listDateSessions, { userId });
  const nextQuery = useQuery(getNextScenario, { userId });
  const personasQuery = useQuery(getPersonas);
  const [starting, setStarting] = useState<"next" | "retry" | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function startPractice(scenario: Scenario, kind: "next" | "retry") {
    setStarting(kind);
    setActionError(null);
    try {
      const session = await createDateSession({ userId, personaId: scenario.personaId, scenario });
      navigate(routes.DateRoute.build({ params: { sessionId: session.id } }));
    } catch {
      setActionError("Couldn't start the date. Please try again.");
      setStarting(null);
    }
  }

  async function finishFeedback() {
    setFinishing(true);
    setActionError(null);
    try {
      await endDateSession({ userId, id: sessionId });
    } catch {
      setActionError("Couldn't finish the feedback. Please try again.");
    } finally {
      setFinishing(false);
    }
  }

  if (sessionQuery.isLoading || historyQuery.isLoading || nextQuery.isLoading || personasQuery.isLoading) {
    return <AppShell wide><Skeleton label="Loading your feedback" lines={4} /></AppShell>;
  }
  if (sessionQuery.error || !sessionQuery.data?.persona) {
    return <AppShell wide><EmptyState title="Couldn't find this date" description="It may belong to another browser, or the connection failed."
      action={<Button onClick={() => navigate(routes.DashboardRoute.build())}>Back to dashboard</Button>} /></AppShell>;
  }
  const session = sessionQuery.data;
  const persona = sessionQuery.data.persona;
  if (!session.evaluation || session.status !== "evaluated") {
    return (
      <AppShell wide>
        {actionError && <Alert tone="danger" title="Couldn't save your feedback">{actionError}</Alert>}
        <EmptyState title={session.status === "active" ? "This date is still in progress" : "Feedback isn't finished yet"}
          description="Your saved conversation is available. Finish the date to see its results."
          action={session.status === "active"
            ? <Button onClick={() => navigate(routes.DateRoute.build({ params: { sessionId } }))}>Return to date</Button>
            : <Button loading={finishing} onClick={() => void finishFeedback()}>Finish feedback</Button>} />
      </AppShell>
    );
  }
  return (
    <FeedbackContent
      session={{ ...session, persona, evaluation: session.evaluation }}
      history={historyQuery.data ?? []}
      nextScenario={nextQuery.data}
      personas={personasQuery.data ?? []}
      starting={starting}
      actionError={actionError}
      onStart={startPractice}
      onDashboard={() => navigate(routes.DashboardRoute.build())}
    />
  );
}

function FeedbackContent({ session, history, nextScenario, personas, starting, actionError, onStart, onDashboard }: {
  session: DateSessionDTO & { persona: Persona; evaluation: NonNullable<DateSessionDTO["evaluation"]> };
  history: DateSessionSummary[];
  nextScenario?: Scenario;
  personas: PersonaWithScenario[];
  starting: "next" | "retry" | null;
  actionError: string | null;
  onStart: (scenario: Scenario, kind: "next" | "retry") => Promise<void>;
  onDashboard: () => void;
}) {
  const [savedToast, setSavedToast] = useState(true);
  const { persona, evaluation, transcript, moves } = session;
  const previousScores = scoresBefore(history, session.id);
  const nextPersona = personas.find((person) => person.id === nextScenario?.personaId);
  const target = SKILLS.find((skill) => skill.key === nextScenario?.targetWeakness);
  const hasReplies = transcript.some((turn) => turn.speaker === "user");
  const durationSec = session.endedAt ? Math.max(0, Math.floor((session.endedAt.getTime() - session.startedAt.getTime()) / 1000)) : 0;

  return (
    <AppShell wide>
      <PageHeader
        title="How your date went"
        description={
          <span className="inline-flex flex-wrap items-center gap-x-2">
            {persona.name} · {session.scenario.setting} · {formatDate(session.startedAt.toISOString())}
            {durationSec ? ` · ${formatDuration(durationSec)}` : ""}
          </span>
        }
        action={
          <Button variant="secondary" onClick={onDashboard}>
            Back to dashboard
          </Button>
        }
      />

      {hasReplies ? <SkillScoreGrid scores={evaluation.scores} previous={previousScores} /> : <p className="text-sm text-subtle">There were no replies to score on this date.</p>}
      {actionError && <div className="mt-4"><Alert tone="danger" title="Couldn't start the date">{actionError}</Alert></div>}

      <Panel className="mt-6">
        <PanelHeader title="Summary" />
        <p className="max-w-prose text-base text-subtle">{evaluation.summary}</p>
      </Panel>

      <div className="mt-6">
        <MoveReview transcript={transcript} moves={moves} personaName={persona.name} />
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
      {nextScenario && nextPersona ? <Panel className="mt-6 border-brand/30 bg-brand-subtle/40">
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
            <Button size="lg" loading={starting === "next"} disabled={starting !== null} onClick={() => void onStart(nextScenario, "next")}>
              Start this date <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="ghost"
              loading={starting === "retry"}
              disabled={starting !== null}
              onClick={() => void onStart(session.scenario, "retry")}
            >
              <RotateCcw className="size-4" aria-hidden="true" /> Retry this one
            </Button>
          </div>
        </div>
      </Panel> : <div className="mt-6"><Alert tone="warning" title="Next practice isn't available">Your feedback is saved. Return to the plaza to choose another date.</Alert></div>}

      <div className="fixed inset-x-4 bottom-4 z-50 sm:left-auto sm:right-6 sm:bottom-6 sm:w-96">
        <Toast
          open={savedToast}
          onOpenChange={setSavedToast}
          title="Feedback saved"
          description="Your transcript and feedback are available here."
        />
      </div>
    </AppShell>
  );
}

function PointList({ points, kind }: { points: EvidencedPoint[]; kind: "strength" | "weakness" }) {
  const Icon = kind === "strength" ? Check : TriangleAlert;
  if (points.length === 0) return <p className="text-sm text-subtle">No specific feedback was recorded for this date.</p>;
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

import { ArrowRight, Check, ChevronRight, Clock, Sparkles, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router";
import { Link, routes } from "wasp/client/router";
import type { Scenario } from "../shared/types";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { SkillScoreList } from "@/components/SkillScores";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { DIFFICULTY_LABEL, SKILLS, getMockDashboard, personaFor, scenarios, type SessionSummary } from "@/client/mockData";
import { formatDate, formatDuration } from "@/lib/format";

const difficultyTone = { easy: "success", medium: "info", hard: "warning" } as const;

export function DashboardPage() {
  // Swap for: const { data: dashboard, isLoading } = useQuery(getDashboard)
  const dashboard = getMockDashboard();
  const navigate = useNavigate();

  function startDate(scenario: Scenario) {
    // TODO(backend): const { id } = await createSession({ scenarioId: scenario.id })
    const id = `s-new-${scenario.id}`;
    navigate(routes.DateRoute.build({ params: { sessionId: id } }));
  }

  const { profile, skills, skillDelta, memory, recommended, sessions } = dashboard;
  const recommendedPersona = personaFor(recommended);
  const target = SKILLS.find((s) => s.key === recommended.targetWeakness);

  return (
    <AppShell wide>
      <PageHeader title={`Hi ${profile.name}`} description="Here's where your dating skills stand and what to practice next." />

      {/* Recommended next date, targeted at the weakest skill */}
      <Panel className="mb-6 border-brand/30 bg-brand-subtle/40">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <PersonaAvatar persona={recommendedPersona} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg text-foreground">Practice this next</h2>
              {target && (
                <Badge tone="neutral" pill icon={<Sparkles className="size-3" />}>
                  Targets {target.label.toLowerCase()}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-subtle">
              {recommendedPersona.name}, {recommended.setting.toLowerCase()}.{" "}
              {recommended.openingLine && <span className="italic">"{recommended.openingLine}"</span>}
            </p>
          </div>
          <Button size="lg" onClick={() => startDate(recommended)}>
            Start date <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Panel>
          <PanelHeader title="Your skills" description="Scores from your latest date, with the change since the one before." />
          <SkillScoreList scores={skills} delta={skillDelta} />
        </Panel>

        <Panel>
          <PanelHeader title="What we remember" description="Carried into every new date." />
          <MemoryList title="Strengths" items={memory.strengths} kind="strength" />
          <div className="my-5 h-px bg-border" />
          <MemoryList title="Working on" items={memory.weaknesses} kind="weakness" />
        </Panel>
      </div>

      <section id="new-date" aria-labelledby="new-date-title" className="mt-10 scroll-mt-20">
        <PanelHeader title={<span id="new-date-title">Start a new date</span>} description="Pick who you want to practice with." />
        <ul className="grid gap-4 md:grid-cols-3">
          {scenarios.map((scenario) => {
            const persona = personaFor(scenario);
            return (
              <li key={scenario.id} className="flex flex-col rounded-(--radius-panel) border border-border bg-surface p-5 transition-shadow hover:shadow-(--shadow-raised)">
                <div className="flex items-center gap-3">
                  <PersonaAvatar persona={persona} size={48} />
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">
                      {persona.name}, {persona.age}
                    </p>
                    <p className="truncate text-xs text-subtle">{persona.personality}</p>
                  </div>
                </div>
                <p className="mt-4 flex-1 text-sm text-subtle">{persona.bio}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge size="sm" tone={difficultyTone[scenario.difficulty]} dot>
                    {DIFFICULTY_LABEL[scenario.difficulty]}
                  </Badge>
                  <span className="text-xs text-faint">{scenario.setting}</span>
                </div>
                <Button className="mt-4" variant="secondary" onClick={() => startDate(scenario)}>
                  Go on a date with {persona.name}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="history-title" className="mt-10">
        <PanelHeader title={<span id="history-title">Past dates</span>} />
        {sessions.length === 0 ? (
          <EmptyState
            title="No dates yet"
            description="Your past dates and their feedback will show up here."
            action={<Button onClick={() => startDate(recommended)}>Start your first date</Button>}
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-(--radius-panel) border border-border bg-surface">
            {sessions.map((s) => (
              <SessionRow key={s.id} session={s} />
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}

function MemoryList({ title, items, kind }: { title: string; items: string[]; kind: "strength" | "weakness" }) {
  const Icon = kind === "strength" ? Check : TriangleAlert;
  return (
    <div>
      <h3 className="mb-2.5 text-sm font-medium text-foreground">{title}</h3>
      <ul className="grid gap-2">
        {items.map((item) => (
          <li key={item} className="flex gap-2.5 text-sm text-subtle">
            <Icon className={kind === "strength" ? "mt-0.5 size-4 shrink-0 text-success" : "mt-0.5 size-4 shrink-0 text-warning"} aria-hidden="true" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SessionRow({ session }: { session: SessionSummary }) {
  const avg = session.scores ? Object.values(session.scores).reduce((a, b) => a + b, 0) / 4 : undefined;
  return (
    <li>
      <Link
        to="/feedback/:sessionId"
        params={{ sessionId: session.id }}
        className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-muted sm:px-5"
      >
        <PersonaAvatar persona={session.persona} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">
            {session.persona.name} · {session.scenario.setting}
          </p>
          <p className="flex items-center gap-1.5 text-xs text-faint">
            {formatDate(session.startedAt)}
            {session.durationSec && (
              <>
                <Clock className="size-3" aria-hidden="true" /> {formatDuration(session.durationSec)}
              </>
            )}
          </p>
        </div>
        {avg !== undefined && (
          <span className="text-right">
            <span className="block font-heading text-lg tabular-nums text-foreground">{avg.toFixed(1)}</span>
            <span className="block text-[11px] text-faint">avg score</span>
          </span>
        )}
        <ChevronRight className="size-4 text-faint" aria-hidden="true" />
      </Link>
    </li>
  );
}

import { useEffect, useState } from "react";
import { ArrowRight, Check, Flame, MessageSquare, RotateCcw, Sparkles, TriangleAlert } from "lucide-react";
import { useLocation, useNavigate } from "react-router";
import { createDateSession } from "wasp/client/operations";
import { routes } from "wasp/client/router";
import type { Scenario } from "../shared/types";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { SkillScoreList } from "@/components/SkillScores";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { Tooltip } from "@/components/arc/tooltip/tooltip";
import { DIFFICULTY_LABEL, SKILLS, getMockDashboard, personaFor, scenarios, type SessionSummary, type SkillScores as SkillScoresT } from "@/client/mockData";
import { formatDate, formatDuration } from "@/lib/format";
import { getUserId } from "@/client/userId";
import { practiceStreak } from "@/lib/streak";
import { cn } from "@/lib/utils";

const difficultyTone = { easy: "success", medium: "info", hard: "warning" } as const;

/** Before noon: morning. Noon to 6pm: afternoon. After 6pm: evening. Uses the browser's local time. */
function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  // Swap for: const { data: dashboard, isLoading } = useQuery(getDashboard)
  const dashboard = getMockDashboard();
  const navigate = useNavigate();

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // Creates a real date session. Persona picks use the server's own scenario for that persona;
  // the targeted recommendation is sent as-is.
  async function startDate(scenario: Scenario, { custom = false } = {}) {
    setStarting(true);
    setStartError(null);
    try {
      const session = await createDateSession({
        userId: getUserId(),
        personaId: scenario.personaId,
        ...(custom ? { scenario } : {}),
      });
      navigate(routes.DateRoute.build({ params: { sessionId: session.id } }));
    } catch (err) {
      setStartError(err instanceof Error ? err.message : "Couldn't start the date.");
      setStarting(false);
    }
  }

  const { profile, skills, skillDelta, memory, recommended, sessions } = dashboard;
  const options = [recommended, ...scenarios];
  const [choice, setChoice] = useState(recommended.id);
  const chosen = options.find((s) => s.id === choice) ?? recommended;

  // The header's "New date" link points at /#new-date; React Router doesn't scroll to hashes on its own.
  const { hash, key } = useLocation();
  useEffect(() => {
    if (hash !== "#new-date") return;
    const el = document.getElementById("new-date");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"], [role="radio"]')?.focus({ preventScroll: true });
  }, [hash, key]);

  return (
    <AppShell wide>
      <PageHeader title={`${greeting()}, ${profile.name}`} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column: start a date, past dates */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <StartPanel options={options} recommended={recommended} value={chosen.id} onChange={setChoice} onStart={() => void startDate(chosen, { custom: chosen.id === recommended.id })} starting={starting} error={startError} />
          <PastDates sessions={sessions} onRetry={(s) => void startDate(s.scenario)} onFirst={() => void startDate(recommended, { custom: true })} />
        </div>

        {/* Sidebar: streak, skills, memory */}
        <aside className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-label="Your progress">
          <StreakCard dates={sessions.map((s) => s.startedAt)} />
          <Panel>
            <PanelHeader title="Your skills" description="From your latest date, with the change since the one before." />
            <SkillScoreList scores={skills} delta={skillDelta} />
          </Panel>
          <Panel>
            <PanelHeader title="What we remember" description="Carried into every new date." />
            <MemoryList title="Strengths" items={memory.strengths} kind="strength" />
            <div className="my-5 h-px bg-border" />
            <MemoryList title="Working on" items={memory.weaknesses} kind="weakness" />
          </Panel>
        </aside>
      </div>
    </AppShell>
  );
}

/** One place to start a date: the recommended one is preselected, the personas sit beside it. */
function StartPanel({
  options,
  recommended,
  value,
  onChange,
  onStart,
  starting,
  error,
}: {
  starting: boolean;
  error: string | null;
  options: Scenario[];
  recommended: Scenario;
  value: string;
  onChange: (id: string) => void;
  onStart: () => void;
}) {
  const chosen = options.find((s) => s.id === value) ?? recommended;
  const persona = personaFor(chosen);
  return (
    <Panel id="new-date" aria-labelledby="new-date-title" className="scroll-mt-20">
      <PanelHeader title={<span id="new-date-title">Start a date</span>} />
      <RadioCards
        aria-label="Who to date"
        layout="grid"
        minColumnWidth={150}
        value={value}
        onValueChange={onChange}
        options={options.map((scenario) => {
          const p = personaFor(scenario);
          const isRecommended = scenario.id === recommended.id;
          const target = SKILLS.find((s) => s.key === scenario.targetWeakness);
          return {
            value: scenario.id,
            // Arc reserves an 18px slot for the icon.
            icon: isRecommended ? <Sparkles aria-hidden="true" /> : <PersonaAvatar persona={p} size={18} />,
            label: isRecommended ? "For you" : `${p.name}, ${p.age}`,
            description: isRecommended && target ? `${p.name} · works on ${target.label.toLowerCase()}` : scenario.setting,
            meta: (
              <Badge size="sm" tone={difficultyTone[scenario.difficulty]} dot>
                {DIFFICULTY_LABEL[scenario.difficulty]}
              </Badge>
            ),
          };
        })}
      />
      <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {persona.name} · {chosen.setting}
          </p>
          {chosen.openingLine && <p className="mt-0.5 truncate text-sm italic text-subtle">"{chosen.openingLine}"</p>}
        </div>
        <Button size="lg" onClick={onStart} loading={starting} className="sm:min-w-44">
          Start date <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
      {error && (
        <div className="mt-4">
          <Alert tone="danger" title="Couldn't start the date">
            {error}
          </Alert>
        </div>
      )}
    </Panel>
  );
}

function StreakCard({ dates }: { dates: string[] }) {
  const { current, practicedToday, week } = practiceStreak(dates);
  return (
    <Panel>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-brand-subtle text-brand-strong">
          <Flame className="size-5" aria-hidden="true" />
        </span>
        <div>
          <p className="font-heading text-xl text-foreground">
            {current} day{current === 1 ? "" : "s"}
          </p>
          <p className="text-xs text-subtle">{practicedToday ? "Practice streak" : current ? "Practice today to keep your streak" : "Practice today to start a streak"}</p>
        </div>
      </div>
      <ol className="mt-4 grid grid-cols-7 gap-1.5" aria-label="This week">
        {week.map((day) => (
          <li key={day.date.toISOString()} className="flex flex-col items-center gap-1.5">
            <span className={cn("text-[11px]", day.isToday ? "font-medium text-foreground" : "text-faint")}>{day.label}</span>
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full border",
                day.practiced ? "border-transparent bg-brand text-accent-foreground" : "border-border",
                day.isToday && !day.practiced && "border-brand",
                day.isFuture && "opacity-50",
              )}
            >
              {day.practiced && <Check className="size-3.5" aria-hidden="true" />}
              <span className="sr-only">
                {day.date.toLocaleDateString(undefined, { weekday: "long" })}: {day.practiced ? "practised" : "no date"}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

const average = (scores: SkillScoresT) => Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;

function PastDates({ sessions, onRetry, onFirst }: { sessions: SessionSummary[]; onRetry: (s: SessionSummary) => void; onFirst: () => void }) {
  const navigate = useNavigate();
  return (
    <Panel className="p-0 sm:p-0">
      <div className="px-5 pt-5 sm:px-6 sm:pt-6">
        <PanelHeader title={<span id="history-title">Past dates</span>} />
      </div>
      {sessions.length === 0 ? (
        <div className="px-5 pb-6">
          <EmptyState
            icon={<MessageSquare width={24} height={24} strokeWidth={1.5} />}
            title="No dates yet"
            description="Your past dates and their feedback will show up here."
            action={<Button onClick={onFirst}>Start your first date</Button>}
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-labelledby="history-title">
          <thead>
            <tr className="border-y border-border bg-surface-muted text-left text-xs text-faint">
              <th scope="col" className="px-5 py-2.5 font-medium sm:px-6">Date with</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Score</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Length</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">When</th>
              <th scope="col" className="px-5 py-2.5 sm:px-6"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((s, i) => {
              const score = s.scores ? average(s.scores) : undefined;
              const prev = sessions[i + 1]?.scores;
              const change = score !== undefined && prev ? Math.round((score - average(prev)) * 10) / 10 : undefined;
              return (
                <tr key={s.id}>
                  <td className="px-5 py-3 sm:px-6">
                    <div className="flex items-center gap-3">
                      <PersonaAvatar persona={s.persona} size={36} />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{s.persona.name}</p>
                        <p className="truncate text-xs text-faint">{s.scenario.setting}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {score !== undefined ? (
                      <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
                        {change !== undefined && change !== 0 && (
                          <span className={cn("text-xs", change > 0 ? "text-success" : "text-danger")}>
                            {change > 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}
                          </span>
                        )}
                        <span className="font-heading text-base text-foreground">{score.toFixed(1)}</span>
                      </span>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 text-right tabular-nums text-subtle md:table-cell">
                    {s.durationSec ? formatDuration(s.durationSec) : "–"}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-3 text-subtle sm:table-cell">{formatDate(s.startedAt)}</td>
                  <td className="px-5 py-3 sm:px-6">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigate(routes.FeedbackRoute.build({ params: { sessionId: s.id } }))}>
                        Review
                      </Button>
                      <Tooltip content={`Same date with ${s.persona.name} again`}>
                        <Button size="sm" variant="ghost" onClick={() => onRetry(s)} aria-label={`Retry the date with ${s.persona.name}`}>
                          <RotateCcw className="size-4" aria-hidden="true" />
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      )}
    </Panel>
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

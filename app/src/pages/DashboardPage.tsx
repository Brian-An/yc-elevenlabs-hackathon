import { Check, Flame, MessageSquare, TriangleAlert } from "lucide-react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { getProfile, listDateSessions, useQuery } from "wasp/client/operations";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { SkillScoreList } from "@/components/SkillScores";
import { Button } from "@/components/arc/button/button";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { getUserId } from "@/client/userId";
import { useFirstRunRedirect } from "@/client/useFirstRun";
import { completedSessions, type SessionSummary } from "@/client/results";
import { formatDate, formatDuration } from "@/lib/format";
import { practiceStreak } from "@/lib/streak";
import { cn } from "@/lib/utils";

/** Before noon: morning. Noon to 6pm: afternoon. After 6pm: evening. Uses the browser's local time. */
function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const userId = getUserId();
  useFirstRunRedirect();
  const profileQuery = useQuery(getProfile, { userId });
  const sessionsQuery = useQuery(listDateSessions, { userId });
  if (profileQuery.isLoading || sessionsQuery.isLoading) {
    return <AppShell wide><Skeleton label="Loading your progress" lines={4} /></AppShell>;
  }
  if (profileQuery.error || sessionsQuery.error || !profileQuery.data || !sessionsQuery.data) {
    return (
      <AppShell wide>
        <EmptyState title="Couldn't load your progress" description="Check your connection and try again."
          action={<Button onClick={() => { void profileQuery.refetch(); void sessionsQuery.refetch(); }}>Try again</Button>} />
      </AppShell>
    );
  }
  const profile = profileQuery.data;
  const { memory } = profile;
  const sessions = completedSessions(sessionsQuery.data);
  const skills = memory.skillHistory.at(-1)?.scores;
  const previous = memory.skillHistory.at(-2)?.scores;

  return (
    <AppShell wide>
      <PageHeader title={profile.displayName ? `${greeting()}, ${profile.displayName}` : "Your practice"} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Main column: past dates. Dates start in the world. */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <PastDates sessions={sessions} />
        </div>

        {/* Sidebar: streak, skills, memory */}
        <aside className="grid grid-cols-[minmax(0,1fr)] gap-6" aria-label="Your progress">
          <StreakCard dates={sessions.map((s) => s.startedAt)} />
          <Panel>
            <PanelHeader title="Your skills" description="From your latest date, with the change since the one before." />
            {skills ? <SkillScoreList scores={skills} previous={previous} /> : <p className="text-sm text-subtle">Complete a date to see your skill scores.</p>}
          </Panel>
          <Panel>
            <PanelHeader title="What we remember" description="Carried into every new date." />
            <MemoryList title="Strengths" items={memory.strengths.map((point) => point.point)} kind="strength" />
            <div className="my-5 h-px bg-border" />
            <MemoryList title="Working on" items={memory.weaknesses.map((point) => point.point)} kind="weakness" />
          </Panel>
        </aside>
      </div>
    </AppShell>
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

function PastDates({ sessions }: { sessions: SessionSummary[] }) {
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
            description="Walk up to someone in the plaza to start a date. Your past dates and their feedback will show up here."
            action={<Button onClick={() => navigate(routes.WorldRoute.build())}>Find someone to meet</Button>}
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
              const score = s.overallScore;
              const prev = sessions[i + 1];
              const change = score !== undefined && prev?.overallScore !== undefined && prev.rubricVersion === s.rubricVersion ? score - prev.overallScore : undefined;
              return (
                <tr key={s.id}>
                  {/* Takes the remaining width and lets the setting truncate instead of widening the table. */}
                  <td className="w-full max-w-0 px-5 py-3 sm:px-6">
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
                            {change > 0 ? "▲" : "▼"} {Math.abs(change)}
                          </span>
                        )}
                        <span className="font-heading text-base text-foreground">{score + "/100"}</span>
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
      {items.length === 0 && <p className="text-sm text-subtle">Complete a date to build your practice history.</p>}
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

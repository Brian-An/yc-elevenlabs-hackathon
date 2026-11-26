import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { listDateSessions, useQuery } from "wasp/client/operations";
import type { PersonaWithScenario } from "../server/dto";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { EmptyState } from "@/components/arc/empty-state/empty-state";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/arc/tabs/tabs";
import { CharacterCreator } from "@/components/CharacterCreator";
import { CharacterRow } from "@/components/CharacterRow";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { completedSessions } from "@/client/results";
import { COACH_ID } from "@/world/layout";
import { getUserId } from "@/client/userId";
import { formatDate, formatDuration } from "@/lib/format";

/**
 * The studio, opened from the building on the east side of the plaza: everyone you can date, making new characters,
 * and your past dates. Starting a date from here closes the studio and walks you to that character's table.
 */
export function StudioDialog({ open, onOpenChange, personas, starting, onDate, onCharactersChanged }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personas: readonly PersonaWithScenario[];
  /** The persona a date is being started with, if any. */
  starting: string | null;
  onDate: (personaId: string) => void;
  onCharactersChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  // Everyone waiting at a table except the coach, who isn't a date: the default characters first, then yours.
  const characters = personas.filter((persona) => persona.id !== COACH_ID);
  const changeOpen = (next: boolean) => {
    if (!next) setCreating(false);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent title="Studio" className="sm:max-w-xl">
        <Tabs defaultValue="characters">
          <TabsList aria-label="Studio sections">
            <TabsTrigger value="characters">Characters</TabsTrigger>
            <TabsTrigger value="dates">Past dates</TabsTrigger>
          </TabsList>

          <TabsContent value="characters" className="pt-4">
            {creating ? (
              <CharacterCreator starting={starting} onStartDate={onDate} onCreated={onCharactersChanged} onBack={() => setCreating(false)} />
            ) : (
              <div className="grid gap-3">
                {/* A minmax(0) track lets long settings truncate instead of pushing the actions out of the dialog. */}
                <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
                  {characters.map((persona) => (
                    <CharacterRow key={persona.id} persona={persona} starting={starting === persona.id} disabled={starting !== null}
                      onStart={() => onDate(persona.id)} onDeleted={persona.custom ? onCharactersChanged : undefined} />
                  ))}
                </ul>
                <div>
                  <Button variant="secondary" onClick={() => setCreating(true)}>
                    <Plus className="size-4" aria-hidden="true" />
                    New character
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="dates" className="pt-4">
            <PastDates enabled={open} onClose={() => changeOpen(false)} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PastDates({ enabled, onClose }: { enabled: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const query = useQuery(listDateSessions, { userId: getUserId() }, { enabled });
  if (query.isLoading) return <Skeleton label="Loading past dates" lines={3} avatar />;
  if (query.error) {
    return (
      <EmptyState
        title="Couldn't load your past dates"
        description="Check your connection and try again."
        action={<Button variant="secondary" onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  }

  const sessions = completedSessions(query.data ?? []);
  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={<MessageSquare width={24} height={24} strokeWidth={1.5} />}
        title="No dates yet"
        description="Walk up to someone at a table and say hi. Your dates and their reviews show up here."
        action={<Button onClick={onClose}>Back to the plaza</Button>}
      />
    );
  }

  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-border">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center gap-3 py-2.5">
          <PersonaAvatar persona={s.persona} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{s.persona.name}</p>
            <p className="truncate text-xs text-faint">
              {formatDate(s.startedAt)}
              {s.durationSec ? ` · ${formatDuration(s.durationSec)}` : ""}
            </p>
          </div>
          {s.overallScore !== undefined && (
            <span className="font-heading text-base tabular-nums text-foreground">{s.overallScore}<span className="text-xs text-faint">/100</span></span>
          )}
          <Button size="sm" variant="secondary" onClick={() => navigate(routes.FeedbackRoute.build({ params: { sessionId: s.id } }))}>
            Review
          </Button>
        </li>
      ))}
    </ul>
  );
}

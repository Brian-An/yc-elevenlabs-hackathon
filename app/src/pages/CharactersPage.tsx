import { useEffect, useState, type FormEvent } from "react";
import { MessageCircle, Sparkles, Trash2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { routes } from "wasp/client/router";
import {
  createDateSession,
  deleteCustomPersona,
  generateCustomPersona,
  getPersonas,
  updateCustomPersona,
  useQuery,
} from "wasp/client/operations";
import type { PersonaWithScenario } from "../server/dto";
import type { PersonaProvenance } from "../shared/types";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { Alert } from "@/components/arc/alert/alert";
import { Badge } from "@/components/arc/badge/badge";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import { LabeledSegments } from "@/components/LabeledSegments";
import { Textarea } from "@/components/arc/textarea/textarea";
import { getUserId } from "@/client/userId";

type Form = {
  notes: string;
  gender: string;
  age: string;
  background: string;
  voice: string;
  difficulty: string;
  setting: string;
};

const EMPTY_FORM: Form = { notes: "", gender: "any", age: "", background: "", voice: "", difficulty: "any", setting: "" };

const GENDERS = [
  { value: "any", label: "Let AI choose" },
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Nonbinary" },
];
const DIFFICULTIES = [
  { value: "any", label: "Let AI choose" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

const TRAIT_LABELS: Record<keyof PersonaProvenance, string> = {
  name: "name", age: "age", gender: "gender", appearance: "appearance", personality: "personality",
  interests: "interests", voice: "voice", setting: "setting",
};

const errorMessage = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Starts a date with a character and opens the call. */
function useStartDate() {
  const navigate = useNavigate();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function start(personaId: string) {
    setStarting(personaId);
    setError(null);
    try {
      const session = await createDateSession({ userId: getUserId(), personaId });
      navigate(routes.DateRoute.build({ params: { sessionId: session.id } }));
    } catch (err) {
      setError(errorMessage(err, "Couldn't start the date. Try again."));
      setStarting(null);
    }
  }
  return { start, starting, error };
}

export function CharactersPage() {
  const userId = getUserId();
  const personasQuery = useQuery(getPersonas, { userId });
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<PersonaWithScenario | null>(null);
  // The draft the form replaces when the user changes its description.
  const [replacing, setReplacing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const dates = useStartDate();

  const mine = (personasQuery.data ?? []).filter((persona) => persona.custom && !persona.custom.deleted);
  const fromOnboarding = params.get("from") === "onboarding";

  return (
    <AppShell wide>
      <PageHeader
        title="Characters"
        description={fromOnboarding ? "Describe someone, and practice your first date with a character like them." : "Practice with a character like someone you know."}
      />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          {dates.error && <Alert tone="danger" title="Couldn't start the date">{dates.error}</Alert>}
          {draft ? (
            <CharacterPreview
              persona={draft}
              starting={dates.starting === draft.id}
              onStart={() => void dates.start(draft.id)}
              onChange={setDraft}
              onEditDescription={() => { setReplacing(draft.id); setDraft(null); }}
            />
          ) : (
            <CharacterForm form={form} onFormChange={setForm} replaceId={replacing}
              onGenerated={(persona) => { setDraft(persona); setReplacing(null); void personasQuery.refetch(); }} />
          )}
        </div>
        {/* Shown once there is a character, so the first visit is just the form. */}
        {mine.length > 0 && <aside aria-label="Your characters" className="min-w-0">
          <Panel>
            <PanelHeader title="Your characters" description="Only you can see these. They also wait at café tables in the plaza." />
            {(
              // A minmax(0) track lets long settings truncate instead of pushing the actions out of the panel.
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
                {mine.map((persona) => (
                  <CharacterRow key={persona.id} persona={persona} starting={dates.starting === persona.id} disabled={dates.starting !== null}
                    onStart={() => void dates.start(persona.id)}
                    onDeleted={() => { if (draft?.id === persona.id) setDraft(null); void personasQuery.refetch(); }} />
                ))}
              </ul>
            )}
          </Panel>
        </aside>}
      </div>
    </AppShell>
  );
}

function CharacterForm({ form, onFormChange, replaceId, onGenerated }: {
  form: Form;
  onFormChange: (form: Form) => void;
  replaceId: string | null;
  onGenerated: (persona: PersonaWithScenario) => void;
}) {
  const [details, setDetails] = useState(() => form !== EMPTY_FORM && Object.entries(form).some(([key, value]) => key !== "notes" && value !== EMPTY_FORM[key as keyof Form]));
  const [generating, setGenerating] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => onFormChange({ ...form, [key]: value });
  const notesLength = form.notes.trim().length;

  useEffect(() => {
    if (!generating) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [generating]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (generating) return;
    if (notesLength < 10) {
      setError("Write at least a sentence about them.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const persona = await generateCustomPersona({
        userId: getUserId(),
        notes: form.notes,
        ...(replaceId ? { replaceId } : {}),
        ...(form.gender !== "any" ? { gender: form.gender as "woman" | "man" | "nonbinary" } : {}),
        ...(form.age.trim() ? { age: Number(form.age) } : {}),
        ...(form.background.trim() ? { background: form.background } : {}),
        ...(form.voice.trim() ? { voice: form.voice } : {}),
        ...(form.difficulty !== "any" ? { difficulty: form.difficulty as "easy" | "medium" | "hard" } : {}),
        ...(form.setting.trim() ? { setting: form.setting } : {}),
      });
      onGenerated(persona);
    } catch (err) {
      setError(errorMessage(err, "The character could not be created. Try again."));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Panel>
      <PanelHeader title="Describe someone" />
      <form onSubmit={onSubmit} className="grid gap-5" aria-busy={generating}>
        <Textarea
          label="What do you know about them?"
          description="Interests, how they talk, what they do. Skip names and contact details."
          placeholder="She's into climbing and baking sourdough, teases a lot, grew up in Toronto, and gets really animated about old films."
          rows={5}
          maxLength={2000}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          required
        />
        {details ? (
          <fieldset className="grid gap-5">
            <legend className="sr-only">Optional details</legend>
            <LabeledSegments label="Gender" options={GENDERS} value={form.gender} onValueChange={(v) => set("gender", v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Age" type="number" inputMode="numeric" min={21} max={70} placeholder="Let AI choose" value={form.age} onChange={(e) => set("age", e.target.value)} />
              <Input label="Background" placeholder="e.g. Korean American, grew up in Seoul" maxLength={200} value={form.background} onChange={(e) => set("background", e.target.value)} />
              <Input label="Voice" placeholder="e.g. low and calm, British accent" maxLength={200} value={form.voice} onChange={(e) => set("voice", e.target.value)} />
              <Input label="Where you meet" placeholder="e.g. a ramen bar after work" maxLength={160} value={form.setting} onChange={(e) => set("setting", e.target.value)} />
            </div>
            <LabeledSegments label="How much effort the conversation takes" options={DIFFICULTIES} value={form.difficulty} onValueChange={(v) => set("difficulty", v)} />
          </fieldset>
        ) : (
          <div>
            {/* Offset by the ghost button's padding and border so its text lines up with the fields above. */}
            <Button type="button" variant="ghost" className="-ml-[calc(var(--space-4)+1px)]" onClick={() => setDetails(true)}>Add details (optional)</Button>
          </div>
        )}
        {error && <Alert tone="danger" title="Couldn't create the character">{error}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={generating}>
            <Sparkles className="size-4" aria-hidden="true" />
            {replaceId ? "Create new version" : "Create character"}
          </Button>
          <p role="status" aria-live="polite" className="text-sm text-subtle tabular-nums">
            {generating ? `Writing the character, then matching a voice and look · ${elapsed}s` : ""}
          </p>
        </div>
      </form>
    </Panel>
  );
}

function CharacterPreview({ persona, starting, onStart, onChange, onEditDescription }: {
  persona: PersonaWithScenario;
  starting: boolean;
  onStart: () => void;
  onChange: (persona: PersonaWithScenario) => void;
  onEditDescription: () => void;
}) {
  const custom = persona.custom!;
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({ name: persona.name, setting: persona.defaultScenario.setting, openingLine: persona.defaultScenario.openingLine ?? "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const traits = Object.entries(custom.provenance) as [keyof PersonaProvenance, string][];
  const fromNotes = traits.filter(([, source]) => source === "notes").map(([trait]) => TRAIT_LABELS[trait]);
  const generated = traits.filter(([, source]) => source === "generated").map(([trait]) => TRAIT_LABELS[trait]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      onChange(await updateCustomPersona({ userId: getUserId(), id: persona.id, ...edits }));
      setEditing(false);
    } catch (err) {
      setError(errorMessage(err, "Couldn't save your changes."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel aria-labelledby="character-name" aria-busy={busy}>
      <div className="flex items-start gap-4">
        <PersonaAvatar persona={persona} size={72} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="character-name" className="font-heading text-2xl text-foreground">{persona.name}</h2>
            <Badge icon={<Sparkles className="size-3" aria-hidden="true" />} pill>AI-generated</Badge>
          </div>
          <p className="mt-1 text-sm text-subtle">{persona.age} · {capitalize(custom.gender)} · {capitalize(persona.difficulty)} difficulty</p>
        </div>
      </div>

      <div className="mt-5 grid max-w-prose gap-3 text-sm">
        <p className="text-foreground">{persona.bio}</p>
        <p className="text-subtle">{persona.personality}</p>
      </div>

      {editing ? (
        <div className="mt-5 grid gap-4">
          <Input label="Name" maxLength={40} value={edits.name} onChange={(e) => setEdits({ ...edits, name: e.target.value })} />
          <Input label="Where you meet" maxLength={160} value={edits.setting} onChange={(e) => setEdits({ ...edits, setting: e.target.value })} />
          <Textarea label="First thing they say" rows={2} maxLength={200} value={edits.openingLine} onChange={(e) => setEdits({ ...edits, openingLine: e.target.value })} />
          <div className="flex gap-3">
            <Button onClick={() => void save()} loading={busy}>Save changes</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <dl className="mt-5 grid gap-3 border-t border-border pt-5 text-sm sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-6">
          <dt className="text-faint">Where you meet</dt>
          <dd className="text-foreground">{persona.defaultScenario.setting}</dd>
          <dt className="text-faint">They open with</dt>
          <dd className="text-foreground">“{persona.defaultScenario.openingLine}”</dd>
          <dt className="text-faint">Voice</dt>
          <dd className="text-foreground">{custom.voiceName ?? "The voice agent's default voice"}</dd>
          {fromNotes.length > 0 && <>
            <dt className="text-faint">From your notes</dt>
            <dd className="text-foreground">{capitalize(fromNotes.join(", "))}</dd>
          </>}
          {generated.length > 0 && <>
            <dt className="text-faint">Chosen by AI</dt>
            <dd className="text-foreground">{capitalize(generated.join(", "))}</dd>
          </>}
        </dl>
      )}

      {error && <div className="mt-5"><Alert tone="danger" title="Something went wrong">{error}</Alert></div>}

      {!editing && (
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" onClick={onStart} loading={starting}>
            <MessageCircle className="size-4" aria-hidden="true" />
            Start a date with {persona.name}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setEditing(true)} disabled={starting}>Edit details</Button>
          <Button size="lg" variant="ghost" onClick={onEditDescription} disabled={starting}>Change description</Button>
        </div>
      )}
    </Panel>
  );
}

function CharacterRow({ persona, starting, disabled, onStart, onDeleted }: {
  persona: PersonaWithScenario;
  starting: boolean;
  disabled: boolean;
  onStart: () => void;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteCustomPersona({ userId: getUserId(), id: persona.id });
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setError(errorMessage(err, "Couldn't delete the character."));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex items-center gap-3 py-2">
      <PersonaAvatar persona={persona} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{persona.name}, {persona.age}</p>
        <p className="truncate text-xs text-faint">{persona.defaultScenario.setting}</p>
      </div>
      <Button size="sm" variant="secondary" onClick={onStart} loading={starting} disabled={disabled}>Date</Button>
      <Button size="sm" variant="ghost" aria-label={`Delete ${persona.name}`} onClick={() => setConfirming(true)} disabled={disabled}>
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
      <Dialog open={confirming} onOpenChange={(open) => { if (!deleting) setConfirming(open); }}>
        <DialogContent title={`Delete ${persona.name}?`} description="You won't be able to start new dates with them. Past dates stay in your history, and your description of them is erased.">
          {error && <Alert tone="danger" title="Couldn't delete">{error}</Alert>}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>Keep {persona.name}</Button>
            <Button variant="danger" loading={deleting} onClick={() => void remove()}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

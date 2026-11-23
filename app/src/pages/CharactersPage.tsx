import { useEffect, useState, type FormEvent } from "react";
import { Dices, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  deleteCustomPersona,
  getPersonas,
  getProfile,
  updateCustomPersona,
  useQuery,
} from "wasp/client/operations";
import type { PersonaWithScenario } from "../server/dto";
import type { Difficulty } from "../shared/types";
import { AppShell } from "@/components/AppShell";
import { CharacterCard } from "@/components/CharacterCard";
import { Disclosure } from "@/components/Disclosure";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { Alert } from "@/components/arc/alert/alert";
import { Button } from "@/components/arc/button/button";
import { Dialog, DialogContent } from "@/components/arc/dialog/dialog";
import { Input } from "@/components/arc/input/input";
import { InlineError } from "@/components/InlineError";
import { LabeledSegments } from "@/components/LabeledSegments";
import { Textarea } from "@/components/arc/textarea/textarea";
import { DIFFICULTY_OPTIONS, difficultyFor, errorMessage, useGenerateCharacter, useStartDate } from "@/client/practice";
import { getUserId } from "@/client/userId";

type Form = {
  notes: string;
  gender: string;
  age: string;
  background: string;
  voice: string;
  /** Empty until the user picks one; until then the profile's difficulty applies. */
  difficulty: Difficulty | "";
  setting: string;
};

const EMPTY_FORM: Form = { notes: "", gender: "any", age: "", background: "", voice: "", difficulty: "", setting: "" };

const GENDERS = [
  { value: "any", label: "Any" },
  { value: "woman", label: "Woman" },
  { value: "man", label: "Man" },
  { value: "nonbinary", label: "Nonbinary" },
];

export function CharactersPage() {
  const userId = getUserId();
  const personasQuery = useQuery(getPersonas, { userId });
  const profile = useQuery(getProfile, { userId });
  const [draft, setDraft] = useState<PersonaWithScenario | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const dates = useStartDate();
  const characters = useGenerateCharacter();

  const mine = (personasQuery.data ?? []).filter((persona) => persona.custom && !persona.custom.deleted);
  const difficulty = form.difficulty || difficultyFor(profile.data?.experienceLevel);

  /** Creates a character from the form; with `replaceId`, the new one takes the draft's place. */
  async function create(replaceId?: string) {
    const persona = await characters.generate({
      notes: form.notes,
      difficulty,
      ...(replaceId ? { replaceId } : {}),
      ...(form.gender !== "any" ? { gender: form.gender as "woman" | "man" | "nonbinary" } : {}),
      ...(form.age.trim() ? { age: Number(form.age) } : {}),
      ...(form.background.trim() ? { background: form.background } : {}),
      ...(form.voice.trim() ? { voice: form.voice } : {}),
      ...(form.setting.trim() ? { setting: form.setting } : {}),
    });
    if (persona) {
      setDraft(persona);
      void personasQuery.refetch();
    }
  }

  return (
    <AppShell wide>
      <PageHeader title="Characters" />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          {draft ? (
            <CharacterPreview
              persona={draft}
              starting={dates.starting === draft.id}
              regenerating={characters.generating}
              error={characters.error ?? dates.error}
              onStart={() => void dates.start(draft.id)}
              onRegenerate={() => void create(draft.id)}
              onChange={setDraft}
              onDone={() => { setDraft(null); setForm(EMPTY_FORM); characters.clearError(); }}
            />
          ) : (
            <CharacterForm form={form} difficulty={difficulty} onFormChange={setForm} generating={characters.generating}
              elapsed={characters.elapsed} error={characters.error} onSubmit={() => void create()} />
          )}
        </div>
        {/* Shown once there is a character, so the first visit is just the form. */}
        {mine.length > 0 && <aside aria-label="Your characters" className="min-w-0">
          <Panel>
            <PanelHeader title="Your characters" />
            {/* A minmax(0) track lets long settings truncate instead of pushing the actions out of the panel. */}
            <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
              {mine.map((persona) => (
                <CharacterRow key={persona.id} persona={persona} starting={dates.starting === persona.id} disabled={dates.starting !== null}
                  onStart={() => void dates.start(persona.id)}
                  onDeleted={() => { if (draft?.id === persona.id) setDraft(null); void personasQuery.refetch(); }} />
              ))}
            </ul>
            {dates.error && !draft && <InlineError className="mt-3 justify-start">{dates.error}</InlineError>}
          </Panel>
        </aside>}
      </div>
    </AppShell>
  );
}

function CharacterForm({ form, difficulty, onFormChange, generating, elapsed, error, onSubmit }: {
  form: Form;
  difficulty: Difficulty;
  onFormChange: (form: Form) => void;
  generating: boolean;
  elapsed: number;
  error: string | null;
  onSubmit: () => void;
}) {
  const [tooShort, setTooShort] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => onFormChange({ ...form, [key]: value });
  const notes = form.notes.trim();
  const hasDetails = Object.entries(form).some(([key, value]) => key !== "notes" && key !== "difficulty" && value !== EMPTY_FORM[key as keyof Form]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (generating) return;
    // A few words are enough to build on; one or two letters are probably a slip.
    if (notes.length > 0 && notes.length < 3) {
      setTooShort(true);
      return;
    }
    setTooShort(false);
    onSubmit();
  }

  return (
    <Panel>
      <form onSubmit={submit} className="grid gap-6" aria-busy={generating}>
        <Textarea
          label="Who do you want to meet?"
          placeholder="A shy barista who loves jazz. Or leave it blank for a surprise."
          rows={3}
          maxLength={2000}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          error={tooShort ? "Add a few more words, or leave it blank." : undefined}
        />
        <LabeledSegments label="Difficulty" options={DIFFICULTY_OPTIONS} value={difficulty} onValueChange={(v) => set("difficulty", v as Difficulty)} />
        <Disclosure label="More options" defaultOpen={hasDetails}>
          <fieldset className="grid gap-5">
            <legend className="sr-only">More options</legend>
            <LabeledSegments label="Gender" options={GENDERS} value={form.gender} onValueChange={(v) => set("gender", v)} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Age" type="number" inputMode="numeric" min={21} max={70} placeholder="Any" value={form.age} onChange={(e) => set("age", e.target.value)} />
              <Input label="Background" placeholder="Grew up in Seoul" maxLength={200} value={form.background} onChange={(e) => set("background", e.target.value)} />
              <Input label="Voice" placeholder="Low and calm, British" maxLength={200} value={form.voice} onChange={(e) => set("voice", e.target.value)} />
              <Input label="Where you meet" placeholder="A ramen bar after work" maxLength={160} value={form.setting} onChange={(e) => set("setting", e.target.value)} />
            </div>
          </fieldset>
        </Disclosure>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={generating}>
            {notes ? <Sparkles className="size-4" aria-hidden="true" /> : <Dices className="size-4" aria-hidden="true" />}
            {notes ? "Create" : "Surprise me"}
          </Button>
          <p role="status" aria-live="polite" className="text-sm text-subtle tabular-nums empty:hidden">
            {generating ? `Creating · ${elapsed}s` : ""}
          </p>
          {error && !generating && <InlineError>{error}</InlineError>}
        </div>
      </form>
    </Panel>
  );
}

function CharacterPreview({ persona, starting, regenerating, error, onStart, onRegenerate, onChange, onDone }: {
  persona: PersonaWithScenario;
  starting: boolean;
  regenerating: boolean;
  error: string | null;
  onStart: () => void;
  onRegenerate: () => void;
  onChange: (persona: PersonaWithScenario) => void;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({ name: persona.name, setting: persona.defaultScenario.setting, openingLine: persona.defaultScenario.openingLine ?? "" });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const locked = starting || regenerating || busy;

  // A regenerated character arrives as a new persona; its fields replace the old ones in the edit form.
  useEffect(() => {
    setEditing(false);
    setEdits({ name: persona.name, setting: persona.defaultScenario.setting, openingLine: persona.defaultScenario.openingLine ?? "" });
  }, [persona.id]);

  async function save() {
    setBusy(true);
    setSaveError(null);
    try {
      onChange(await updateCustomPersona({ userId: getUserId(), id: persona.id, ...edits }));
      setEditing(false);
    } catch (err) {
      setSaveError(errorMessage(err, "Couldn't save your changes."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel aria-busy={locked}>
      <CharacterCard
        persona={persona}
        actions={editing ? undefined : <>
          <Button size="lg" onClick={onStart} loading={starting} disabled={locked}>Start date</Button>
          <Button size="lg" variant="secondary" onClick={onRegenerate} loading={regenerating} disabled={locked}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try another
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setEditing(true)} disabled={locked}>Edit</Button>
          <Button size="lg" variant="ghost" onClick={onDone} disabled={locked}>New character</Button>
        </>}
      >
        {editing ? (
          <div className="grid gap-4">
            <Input label="Name" maxLength={40} value={edits.name} onChange={(e) => setEdits({ ...edits, name: e.target.value })} />
            <Input label="Where you meet" maxLength={160} value={edits.setting} onChange={(e) => setEdits({ ...edits, setting: e.target.value })} />
            <Textarea label="First thing they say" rows={2} maxLength={200} value={edits.openingLine} onChange={(e) => setEdits({ ...edits, openingLine: e.target.value })} />
            <div className="flex gap-3">
              <Button onClick={() => void save()} loading={busy}>Save</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : undefined}
      </CharacterCard>
      {(saveError ?? error) && <InlineError className="mt-4 justify-start">{(saveError ?? error)!}</InlineError>}
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
        <DialogContent title={`Delete ${persona.name}?`} description="Past dates stay in your history.">
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

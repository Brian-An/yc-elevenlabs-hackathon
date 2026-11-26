import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Dices, RefreshCw, Sparkles } from "lucide-react";
import { getProfile, updateCustomPersona, useQuery } from "wasp/client/operations";
import type { PersonaWithScenario } from "../server/dto";
import { SETTING_MAX_LENGTH, type Difficulty } from "../shared/types";
import { CharacterCard } from "@/components/CharacterCard";
import { Disclosure } from "@/components/Disclosure";
import { Button } from "@/components/arc/button/button";
import { Input } from "@/components/arc/input/input";
import { InlineError } from "@/components/InlineError";
import { LabeledSegments } from "@/components/LabeledSegments";
import { Textarea } from "@/components/arc/textarea/textarea";
import { DIFFICULTY_OPTIONS, difficultyFor, errorMessage, useGenerateCharacter } from "@/client/practice";
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

/**
 * Describe someone (or leave it blank) and get a character to date, shown in the studio. After creating one you can
 * start a date, try another, or tweak the name, setting and first line.
 */
export function CharacterCreator({ starting, onStartDate, onCreated, onBack }: {
  /** The persona a date is being started with, if any. */
  starting: string | null;
  onStartDate: (personaId: string) => void;
  /** A character was created, replaced or edited: the list of characters needs refreshing. */
  onCreated: () => void;
  onBack: () => void;
}) {
  const profile = useQuery(getProfile, { userId: getUserId() });
  const [draft, setDraft] = useState<PersonaWithScenario | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const characters = useGenerateCharacter();
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
      onCreated();
    }
  }

  return (
    <div className="grid gap-5">
      <div>
        <Button variant="ghost" size="sm" className="-ml-[calc(var(--space-3)+1px)]" onClick={onBack} disabled={characters.generating}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          All characters
        </Button>
      </div>
      {draft ? (
        <CharacterPreview
          persona={draft}
          starting={starting === draft.id}
          regenerating={characters.generating}
          error={characters.error}
          onStart={() => onStartDate(draft.id)}
          onRegenerate={() => void create(draft.id)}
          onChange={(persona) => { setDraft(persona); onCreated(); }}
          onDone={() => { setDraft(null); setForm(EMPTY_FORM); characters.clearError(); }}
        />
      ) : (
        <CharacterForm form={form} difficulty={difficulty} onFormChange={setForm} generating={characters.generating}
          error={characters.error} onSubmit={() => void create()} />
      )}
    </div>
  );
}

function CharacterForm({ form, difficulty, onFormChange, generating, error, onSubmit }: {
  form: Form;
  difficulty: Difficulty;
  onFormChange: (form: Form) => void;
  generating: boolean;
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
              <Input label="Where you meet" placeholder="A ramen bar after work" maxLength={SETTING_MAX_LENGTH} value={form.setting} onChange={(e) => set("setting", e.target.value)} />
            </div>
          </fieldset>
        </Disclosure>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="lg" loading={generating} loadingLabel="Creating…">
            {notes ? <Sparkles className="size-4" aria-hidden="true" /> : <Dices className="size-4" aria-hidden="true" />}
            {notes ? "Create" : "Surprise me"}
          </Button>
          <p role="status" aria-live="polite" className="sr-only">{generating ? "Creating your character" : ""}</p>
          {error && !generating && <InlineError>{error}</InlineError>}
        </div>
    </form>
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
      // Send only what changed: an older character's setting can be longer than today's limit, and leaving it as it
      // is must not block saving a new name or opening line.
      const original = { name: persona.name, setting: persona.defaultScenario.setting, openingLine: persona.defaultScenario.openingLine ?? "" };
      const changed = Object.fromEntries(Object.entries(edits).filter(([key, value]) => value !== original[key as keyof typeof original]));
      onChange(await updateCustomPersona({ userId: getUserId(), id: persona.id, ...changed }));
      setEditing(false);
    } catch (err) {
      setSaveError(errorMessage(err, "Couldn't save your changes."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div aria-busy={locked}>
      <CharacterCard
        persona={persona}
        actions={editing ? undefined : <>
          <Button size="lg" onClick={onStart} loading={starting} loadingLabel="Starting…" disabled={locked}>Start date</Button>
          <Button size="lg" variant="secondary" onClick={onRegenerate} loading={regenerating} loadingLabel="Creating…" disabled={locked}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Try another
          </Button>
          <Button size="lg" variant="ghost" onClick={() => setEditing(true)} disabled={locked}>Edit</Button>
          <Button size="lg" variant="ghost" onClick={onDone} disabled={locked}>Make another</Button>
        </>}
      >
        {editing ? (
          <div className="grid gap-4">
            <Input label="Name" maxLength={40} value={edits.name} onChange={(e) => setEdits({ ...edits, name: e.target.value })} />
            <Input label="Where you meet" maxLength={SETTING_MAX_LENGTH} value={edits.setting} onChange={(e) => setEdits({ ...edits, setting: e.target.value })} />
            <Textarea label="First thing they say" rows={2} maxLength={200} value={edits.openingLine} onChange={(e) => setEdits({ ...edits, openingLine: e.target.value })} />
            <div className="flex gap-3">
              <Button onClick={() => void save()} loading={busy} loadingLabel="Saving…">Save</Button>
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </div>
        ) : undefined}
      </CharacterCard>
      {(saveError ?? error) && <InlineError className="mt-4 justify-start">{(saveError ?? error)!}</InlineError>}
    </div>
  );
}

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { getPersonas, getProfile, updateProfile, useQuery } from "wasp/client/operations";
import { getUserId } from "@/client/userId";
import { Alert } from "@/components/arc/alert/alert";
import { InlineError } from "@/components/InlineError";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { PersonaWithScenario, Profile } from "../server/dto";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel } from "@/components/Panel";
import { Disclosure } from "@/components/Disclosure";
import { Button } from "@/components/arc/button/button";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { Select } from "@/components/arc/select/select";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Input } from "@/components/arc/input/input";
import { LabeledSegments } from "@/components/LabeledSegments";
import { ArrowLeft, Dices, PenLine, RefreshCw, Sparkles } from "lucide-react";
import { Progress } from "@/components/arc/progress/progress";
import { CharacterCard } from "@/components/CharacterCard";
import { difficultyFor, useGenerateCharacter, useStartDate } from "@/client/practice";
import { cn } from "@/lib/utils";
import type { SkillName } from "../shared/types";
import type { ExperienceLevel } from "@/client/mockData";
import { SKILLS } from "@/client/mockData";

export type OnboardingInput = {
  name: string;
  goals: string[];
  experience: ExperienceLevel;
  lookingFor: string;
  interestedIn: string;
  focusSkills: SkillName[];
  focusNote: string;
};

const GOALS = [
  { value: "nerves", label: "Feel less nervous" },
  { value: "keep-going", label: "Keep conversations going" },
  { value: "be-myself", label: "Be more myself" },
  { value: "flirt", label: "Flirt without being weird" },
  { value: "second-date", label: "Get to a second date" },
  { value: "deeper", label: "Go past small talk" },
];

const EXPERIENCE = [
  { value: "beginner", label: "New to it" },
  { value: "intermediate", label: "Some" },
  { value: "experienced", label: "A lot" },
];

export function OnboardingPage() {
  const userId = getUserId();
  const profile = useQuery(getProfile, { userId });
  if (profile.isLoading) return <AppShell variant="focus"><Skeleton label="Loading your profile" lines={4} /></AppShell>;
  if (!profile.data) return <AppShell variant="focus"><Alert tone="danger" title="Couldn't load your profile">
    <Button variant="secondary" onClick={() => void profile.refetch()}>Try again</Button>
  </Alert></AppShell>;
  return <OnboardingMode profile={profile.data} />;
}

/**
 * First visit: a short stepped flow that ends on a first date. Afterwards this page edits the profile. The mode is
 * fixed on arrival: the first run saves the profile before its last step, and must not turn into the edit form then.
 */
function OnboardingMode({ profile }: { profile: Profile }) {
  const [firstRun] = useState(profile.onboardedAt === null);
  return firstRun ? <FirstRun profile={profile} /> : <OnboardingForm profile={profile} />;
}

/** A first-date option: a portrait or icon beside the name. */
function StarterLabel({ media, title }: { media: ReactNode; title: string }) {
  return (
    <span className="flex items-center gap-3">
      {media}
      <span className="truncate">{title}</span>
    </span>
  );
}

/** The skill each goal practises, so the first dates lean into what the user picked. */
const GOAL_SKILLS: Record<string, SkillName> = {
  nerves: "confidence", "keep-going": "flow", "be-myself": "confidence", flirt: "engagement", "second-date": "engagement", deeper: "listening",
};

/** The goals the first run offers: one tap, so only the four that differ most. */
const FIRST_RUN_GOALS = GOALS.filter(({ value }) => ["nerves", "keep-going", "flirt", "deeper"].includes(value));

/** Starter characters and who they suit. Riley coaches and is not a date. */
const STARTERS: { id: string; for: "women" | "men" }[] = [
  { id: "maya", for: "women" },
  { id: "theo", for: "men" },
  { id: "priya", for: "women" },
];
const SURPRISE = "surprise";
const DESCRIBE = "describe";

const INTEREST = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "anyone", label: "Anyone" },
];

const QUESTIONS = ["What should we call you?", "Who do you want to practice with?", "What do you want to get better at?", "How much have you dated?", "Who's your first date?"];

/** Big tap targets that answer the question and move on, one question per screen. */
function Choices({ labelledBy, options, value, onChoose }: {
  labelledBy: string;
  options: { value: string; label: string }[];
  value: string | null;
  onChoose: (value: string) => void;
}) {
  return (
    <div role="group" aria-labelledby={labelledBy} className="grid gap-2">
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChoose(option.value)}
          className={cn(
            "flex min-h-14 w-full items-center rounded-[20px] border border-border bg-surface px-5 text-left text-base font-medium text-foreground",
            "transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--control-on)",
            "[@media(hover:hover)_and_(pointer:fine)]:hover:bg-surface-muted",
            "aria-pressed:border-(--control-on) aria-pressed:bg-[color-mix(in_oklab,var(--control-on)_4%,var(--surface))]",
          )}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FirstRun({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const personas = useQuery(getPersonas);
  const dates = useStartDate();
  const characters = useGenerateCharacter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.displayName ?? "");
  const [interestedIn, setInterestedIn] = useState<string | null>(null);
  const [goal, setGoal] = useState<string | null>(null);
  const [experience, setExperience] = useState<ExperienceLevel | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [draft, setDraft] = useState<PersonaWithScenario | null>(null);
  const [saving, setSaving] = useState<"skip" | "save" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const lastStep = QUESTIONS.length - 1;

  const difficulty = difficultyFor(experience);
  const starters = STARTERS
    .filter((starter) => !interestedIn || interestedIn === "anyone" || starter.for === interestedIn)
    .flatMap((starter) => personas.data?.filter((persona: PersonaWithScenario) => persona.id === starter.id) ?? []);
  // The starter that matches how much they've dated is picked for them, so one tap starts the date.
  const recommended = starters.find((persona) => persona.difficulty === difficulty) ?? starters[0] ?? null;
  const picked = choice ?? recommended?.id ?? SURPRISE;

  // Each new question takes focus, so a screen reader announces it and the keyboard starts from the top.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    heading.current?.focus();
  }, [step, draft]);

  function answer<T>(set: (value: T) => void) {
    return (value: string) => { set(value as T); setStep((current) => Math.min(current + 1, lastStep)); };
  }

  async function saveProfile() {
    const focusSkills = goal && GOAL_SKILLS[goal] ? [GOAL_SKILLS[goal]!] : [];
    await updateProfile({
      userId: profile.id,
      displayName: name,
      experienceLevel: experience ?? undefined,
      goals: GOALS.find(({ value }) => value === goal)?.label ?? undefined,
      preferences: { ...profile.preferences, goals: goal ? [goal] : [], focusSkills, interestedIn: interestedIn ?? "anyone" },
    });
  }

  async function withProfileSaved(then: () => Promise<void>) {
    setSaving("save");
    setError(null);
    try {
      await saveProfile();
    } catch {
      setError("Your answers are still here. Try again.");
      setSaving(null);
      return;
    }
    setSaving(null);
    await then();
  }

  /** Saves the answers first: the character is shaped by them. */
  async function create(replaceId?: string) {
    await withProfileSaved(async () => {
      const notes = picked === DESCRIBE ? description : "";
      const persona = await characters.generate({ notes, difficulty, ...(replaceId ? { replaceId } : {}) });
      if (persona) setDraft(persona);
    });
  }

  async function skip() {
    setSaving("skip");
    setError(null);
    try {
      await updateProfile({ userId: profile.id });
      navigate(routes.WorldRoute.build());
    } catch {
      setError("Couldn't skip right now. Try again.");
      setSaving(null);
    }
  }

  const busy = saving !== null || characters.generating || dates.starting !== null;
  const shownError = error ?? characters.error ?? dates.error;
  const title = draft ? "Meet your first date" : QUESTIONS[step];

  function back() {
    if (draft) { setDraft(null); return; }
    setStep(step - 1);
  }

  return (
    <AppShell variant="focus">
      <div className="mx-auto grid max-w-md gap-8 sm:pt-6">
        <div className="flex items-center gap-2">
          {/* The arrow and Skip keep their place on every question, so the bar never shifts. */}
          <Button variant="ghost" size="sm" aria-label="Back" className={cn("-ml-[calc(var(--space-3)+1px)] [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11", step === 0 && !draft && "invisible")}
            disabled={busy} onClick={back}>
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          {/* Meeting the generated date is the last stretch, so the bar only completes once they're on screen. */}
          <Progress className="flex-1" value={draft ? QUESTIONS.length + 1 : step + 1} max={QUESTIONS.length + 1} />
          <Button variant="ghost" size="sm" className="-mr-[calc(var(--space-3)+1px)] [@media(pointer:coarse)]:min-h-11" loading={saving === "skip"} disabled={busy} onClick={() => void skip()}>Skip</Button>
        </div>

        <h1 ref={heading} id={headingId} tabIndex={-1} className="font-heading text-3xl text-balance text-foreground outline-none sm:text-4xl">{title}</h1>

        {step === 0 && (
          <form className="grid gap-6" onSubmit={(event: FormEvent) => { event.preventDefault(); setStep(1); }}>
            <Input label="First name" placeholder="Sam" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" autoFocus />
            <Button type="submit" size="lg">Continue</Button>
          </form>
        )}

        {step === 1 && <Choices labelledBy={headingId} options={INTEREST} value={interestedIn} onChoose={answer(setInterestedIn)} />}
        {step === 2 && <Choices labelledBy={headingId} options={FIRST_RUN_GOALS} value={goal} onChoose={answer(setGoal)} />}
        {step === 3 && <Choices labelledBy={headingId} options={EXPERIENCE} value={experience} onChoose={answer(setExperience)} />}

        {step === lastStep && draft && (
          <CharacterCard persona={draft} actions={<>
            <Button size="lg" loading={dates.starting === draft.id} disabled={busy} onClick={() => void dates.start(draft.id)}>Start date</Button>
            <Button size="lg" variant="secondary" loading={characters.generating} disabled={busy} onClick={() => void create(draft.id)}>
              <RefreshCw className="size-4" aria-hidden="true" />
              Try another
            </Button>
          </>} />
        )}
        {/* The final question shows its errors under its own button; the others under their answers. */}
        {shownError && (step < lastStep || draft) && <InlineError className={draft ? "justify-start" : undefined}>{shownError}</InlineError>}

        {step === lastStep && !draft && (
          <div className="grid gap-6" aria-busy={characters.generating}>
            {personas.isLoading ? <Skeleton label="Loading characters" lines={3} /> : (
              <RadioCards
                aria-labelledby={headingId}
                layout="list"
                value={picked}
                onValueChange={setChoice}
                disabled={busy}
                options={[
                  ...starters.map((persona) => ({
                    value: persona.id,
                    label: <StarterLabel media={<PersonaAvatar persona={persona} size={40} />} title={`${persona.name}, ${persona.age}`} />,
                    meta: capitalize(persona.difficulty),
                  })),
                  { value: SURPRISE, label: <StarterLabel media={<OptionIcon><Dices className="size-5" aria-hidden="true" /></OptionIcon>} title="Surprise me" /> },
                  { value: DESCRIBE, label: <StarterLabel media={<OptionIcon><PenLine className="size-5" aria-hidden="true" /></OptionIcon>} title="Describe someone" /> },
                ]}
              />
            )}
            {picked === DESCRIBE && (
              <Textarea label="Who are they?" placeholder="A shy barista who loves jazz" rows={2} maxLength={2000} value={description}
                onChange={(e) => setDescription(e.target.value)} autoFocus />
            )}
            {picked === SURPRISE || picked === DESCRIBE ? (
              <div className="grid gap-2">
                <Button size="lg" loading={characters.generating || saving === "save"} disabled={busy || (picked === DESCRIBE && description.trim().length < 3)}
                  onClick={() => void create()}>
                  <Sparkles className="size-4" aria-hidden="true" />
                  {picked === SURPRISE ? "Surprise me" : "Create"}
                </Button>
                <p role="status" aria-live="polite" className="text-center text-sm text-subtle tabular-nums empty:hidden">
                  {characters.generating ? `Creating your date · ${characters.elapsed}s` : ""}
                </p>
                {shownError && !characters.generating && <InlineError>{shownError}</InlineError>}
              </div>
            ) : (
              <div className="grid gap-2">
                <Button size="lg" loading={saving === "save" || dates.starting !== null} disabled={busy}
                  onClick={() => void withProfileSaved(() => dates.start(picked))}>Start date</Button>
                {shownError && <InlineError>{shownError}</InlineError>}
              </div>
            )}
          </div>
        )}

      </div>
    </AppShell>
  );
}

function OptionIcon({ children }: { children: ReactNode }) {
  return <span className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand-strong">{children}</span>;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function OnboardingForm({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const preferences = profile.preferences;
  const selectedSkills = new Set(Array.isArray(preferences.focusSkills) ? preferences.focusSkills : []);
  const [form, setForm] = useState<OnboardingInput>(() => ({
    name: profile.displayName ?? "",
    goals: Array.isArray(preferences.goals) ? preferences.goals : [],
    experience: profile.experienceLevel === "beginner" || profile.experienceLevel === "experienced" ? profile.experienceLevel : "intermediate",
    lookingFor: typeof preferences.lookingFor === "string" ? preferences.lookingFor : "serious",
    interestedIn: typeof preferences.interestedIn === "string" ? preferences.interestedIn : "anyone",
    focusSkills: SKILLS.filter(({ key }) => selectedSkills.has(key)).map(({ key }) => key),
    focusNote: typeof preferences.focusNote === "string" ? preferences.focusNote : "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const set = <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      const selectedGoals = new Set(form.goals);
      await updateProfile({
        userId: profile.id,
        displayName: form.name,
        experienceLevel: form.experience,
        goals: GOALS.filter(({ value }) => selectedGoals.has(value)).map(({ label }) => label).join(", "),
        preferences: { ...preferences, goals: form.goals, focusSkills: form.focusSkills, focusNote: form.focusNote.trim(),
          lookingFor: form.lookingFor, interestedIn: form.interestedIn },
      });
      navigate(routes.DashboardRoute.build());
    } catch {
      setError(true);
      setSaving(false);
    }
  }

  return (
    <AppShell variant="focus">
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Your profile" />
        <form onSubmit={onSubmit} className="grid gap-5">
          <Panel className="grid gap-6">
            <Input label="First name" placeholder="Sam" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="given-name" />
            <LabeledSegments label="Practice with" options={INTEREST} value={form.interestedIn} onValueChange={(v) => set("interestedIn", v)} />
            <ChipGroup label="Goals" options={GOALS} value={form.goals} onValueChange={(v) => set("goals", v)} />
            <LabeledSegments label="Dating experience" options={EXPERIENCE} value={form.experience} onValueChange={(v) => set("experience", v as ExperienceLevel)} />
            <Disclosure label="More">
              <div className="grid gap-6">
                <Select
                  label="Looking for"
                  value={form.lookingFor}
                  onValueChange={(v) => set("lookingFor", v)}
                  options={[
                    { value: "serious", label: "Something serious" },
                    { value: "casual", label: "Something casual" },
                    { value: "unsure", label: "Not sure yet" },
                  ]}
                />
                <ChipGroup
                  label="Skills to work on"
                  options={SKILLS.map((s) => ({ value: s.key, label: s.label }))}
                  value={form.focusSkills}
                  onValueChange={(v) => set("focusSkills", v as SkillName[])}
                />
                <Textarea
                  label="What tends to go wrong?"
                  placeholder="I run out of things to say after the small talk."
                  rows={3}
                  value={form.focusNote}
                  onChange={(e) => set("focusNote", e.target.value)}
                />
              </div>
            </Disclosure>
          </Panel>

          {error && <Alert title="Couldn't save your profile" tone="danger">Your answers are still here. Try saving again.</Alert>}
          <div className="flex justify-end gap-3">
            <Button type="button" disabled={saving} variant="ghost" onClick={() => navigate(routes.DashboardRoute.build())}>Cancel</Button>
            <Button type="submit" loading={saving}>Save</Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

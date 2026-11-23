import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { createDateSession, getPersonas, getProfile, updateProfile, useQuery } from "wasp/client/operations";
import { getUserId } from "@/client/userId";
import { Alert } from "@/components/arc/alert/alert";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { PersonaWithScenario, Profile } from "../server/dto";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { Button } from "@/components/arc/button/button";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { Select } from "@/components/arc/select/select";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Input } from "@/components/arc/input/input";
import { LabeledSegments } from "@/components/LabeledSegments";
import { Sparkles } from "lucide-react";
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
  { value: "beginner", label: "Pretty new", description: "A handful of dates, or none yet." },
  { value: "intermediate", label: "Some experience", description: "I date, but it doesn't always click." },
  { value: "experienced", label: "Experienced", description: "Lots of dates, want to sharpen up." },
];

export function OnboardingPage() {
  const userId = getUserId();
  const profile = useQuery(getProfile, { userId });
  if (profile.isLoading) return <AppShell variant="focus"><Skeleton label="Loading your profile" lines={4} /></AppShell>;
  if (!profile.data) return <AppShell variant="focus"><Alert tone="danger" title="Couldn't load your profile">
    <Button variant="secondary" onClick={() => void profile.refetch()}>Try again</Button>
  </Alert></AppShell>;
  // First visit: a short stepped flow that ends on a first date. Afterwards this page edits the profile.
  return profile.data.onboardedAt ? <OnboardingForm profile={profile.data} /> : <FirstRun profile={profile.data} />;
}

/** A first-date option: a portrait beside the name and one line about them. */
function StarterLabel({ media, title, detail }: { media: ReactNode; title: string; detail: string }) {
  return (
    // The card's label text truncates on one line by default; these labels wrap instead.
    <span className="flex items-center gap-3 whitespace-normal">
      {media}
      <span className="grid gap-0.5">
        <span>{title}</span>
        <span className="text-sm font-normal text-subtle">{detail}</span>
      </span>
    </span>
  );
}

/** The skill each goal practises, so the first dates lean into what the user picked. */
const GOAL_SKILLS: Record<string, SkillName> = {
  nerves: "confidence", "keep-going": "flow", "be-myself": "confidence", flirt: "engagement", "second-date": "engagement", deeper: "listening",
};

/** Starter characters and who they suit. Riley coaches and is not a date. */
const STARTERS: { id: string; for: "women" | "men" }[] = [
  { id: "maya", for: "women" },
  { id: "theo", for: "men" },
  { id: "priya", for: "women" },
];
const DESCRIBE = "describe";

const INTEREST = [
  { value: "women", label: "Women" },
  { value: "men", label: "Men" },
  { value: "anyone", label: "Anyone" },
];

function FirstRun({ profile }: { profile: Profile }) {
  const navigate = useNavigate();
  const personas = useQuery(getPersonas);
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.displayName ?? "");
  const [interestedIn, setInterestedIn] = useState("anyone");
  const [goals, setGoals] = useState<string[]>([]);
  const [experience, setExperience] = useState<ExperienceLevel>("intermediate");
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"start" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const starters = STARTERS
    .filter((starter) => interestedIn === "anyone" || starter.for === interestedIn)
    .flatMap((starter) => personas.data?.filter((persona: PersonaWithScenario) => persona.id === starter.id) ?? []);
  const chosen = starters.find((persona) => persona.id === choice) ?? null;
  const steps = ["Who you'd like to meet", "What to work on", "Your first date"];

  async function saveProfile() {
    const selectedGoals = new Set(goals);
    const focusSkills = [...new Set(goals.map((goal) => GOAL_SKILLS[goal]).filter((skill): skill is SkillName => Boolean(skill)))];
    await updateProfile({
      userId: profile.id,
      displayName: name,
      experienceLevel: experience,
      goals: GOALS.filter(({ value }) => selectedGoals.has(value)).map(({ label }) => label).join(", "),
      preferences: { ...profile.preferences, goals, focusSkills, interestedIn },
    });
  }

  async function finish() {
    if (!choice) return;
    setBusy("start");
    setError(null);
    try {
      await saveProfile();
      if (choice === DESCRIBE) {
        navigate(`${routes.CharactersRoute.build()}?from=onboarding`);
        return;
      }
      const session = await createDateSession({ userId: profile.id, personaId: choice });
      navigate(routes.DateRoute.build({ params: { sessionId: session.id } }));
    } catch {
      setError("Your answers are still here. Try again.");
      setBusy(null);
    }
  }

  async function skip() {
    setBusy("skip");
    setError(null);
    try {
      await updateProfile({ userId: profile.id });
      navigate(routes.WorldRoute.build());
    } catch {
      setError("Couldn't skip right now. Try again.");
      setBusy(null);
    }
  }

  const finishLabel = choice === DESCRIBE ? "Describe someone" : chosen ? `Start a date with ${chosen.name}` : "Choose who to meet";

  return (
    <AppShell variant="focus">
      <div className="mx-auto grid max-w-2xl gap-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-subtle tabular-nums" aria-live="polite">Step {step + 1} of {steps.length} · {steps[step]}</p>
          <Button variant="ghost" size="sm" className="-mr-[calc(var(--space-3)+1px)]" loading={busy === "skip"} disabled={busy !== null} onClick={() => void skip()}>Skip to the plaza</Button>
        </div>

        {step === 0 && (
          <Panel>
            <PageHeader title="Practice dates, out loud" description="Talk with AI characters by voice, then get feedback on how the conversation went." />
            <div className="grid gap-5">
              <Input label="What should your dates call you?" placeholder="Sam" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" />
              <LabeledSegments label="Who would you like to practice with?" options={INTEREST} value={interestedIn} onValueChange={setInterestedIn} />
            </div>
          </Panel>
        )}

        {step === 1 && (
          <Panel>
            <PageHeader title="What do you want to get better at?" description="Your first dates and feedback focus on these." />
            <div className="grid gap-6">
              <ChipGroup label="Goals" options={GOALS} value={goals} onValueChange={setGoals} />
              <div className="grid gap-2">
                <span aria-hidden="true" className="text-sm font-medium text-foreground">How much have you dated?</span>
                <RadioCards aria-label="How much have you dated?" options={EXPERIENCE} value={experience}
                  onValueChange={(v) => setExperience(v as ExperienceLevel)} layout="grid" minColumnWidth={160} />
              </div>
            </div>
          </Panel>
        )}

        {step === 2 && (
          <Panel>
            <PageHeader title="Who's your first date?" description="Pick someone to meet now, or describe a person you'd like to practice with." />
            {personas.isLoading ? <Skeleton label="Loading characters" lines={3} /> : (
              <RadioCards
                aria-label="First date"
                layout="list"
                value={choice}
                onValueChange={setChoice}
                options={[
                  ...starters.map((persona) => ({
                    value: persona.id,
                    label: <StarterLabel media={<PersonaAvatar persona={persona} size={44} />} title={`${persona.name}, ${persona.age}`} detail={persona.bio} />,
                    meta: `${persona.difficulty.charAt(0).toUpperCase()}${persona.difficulty.slice(1)}`,
                  })),
                  {
                    value: DESCRIBE,
                    label: <StarterLabel
                      media={<span className="grid size-11 place-items-center rounded-full bg-brand-subtle text-brand-strong"><Sparkles className="size-5" aria-hidden="true" /></span>}
                      title="Someone like a person you know"
                      detail="Describe them, and AI creates a character with a matching voice and look." />,
                  },
                ]}
              />
            )}
          </Panel>
        )}

        {error && <Alert tone="danger" title="Something went wrong">{error}</Alert>}

        <div className="flex justify-between gap-3">
          {step > 0 ? <Button variant="ghost" className="-ml-[calc(var(--space-4)+1px)]" disabled={busy !== null} onClick={() => setStep(step - 1)}>Back</Button> : <span />}
          {step < steps.length - 1
            ? <Button onClick={() => setStep(step + 1)}>Continue</Button>
            : <Button loading={busy === "start"} disabled={!choice || busy !== null} onClick={() => void finish()}>{finishLabel}</Button>}
        </div>
      </div>
    </AppShell>
  );
}

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
        <PageHeader title="Tell us about you" description="This shapes who you'll meet and what your coach watches for. You can change it later." />
        <form onSubmit={onSubmit} className="grid gap-5">
          <Panel>
            <PanelHeader title="The basics" />
            <Input label="What should your dates call you?" placeholder="Sam" value={form.name} onChange={(e) => set("name", e.target.value)} autoComplete="given-name" />
          </Panel>

          <Panel>
            <PanelHeader title="Your goals" description="Pick any that sound like you." />
            <ChipGroup label="Goals" options={GOALS} value={form.goals} onValueChange={(v) => set("goals", v)} />
          </Panel>

          <Panel>
            <PanelHeader title="Dating experience" />
            <RadioCards
              aria-label="Dating experience"
              options={EXPERIENCE}
              value={form.experience}
              onValueChange={(v) => set("experience", v as ExperienceLevel)}
              layout="grid"
              minColumnWidth={160}
            />
          </Panel>

          <Panel>
            <PanelHeader title="Preferences" />
            <div className="grid gap-4 sm:grid-cols-2">
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
              <Select
                label="Practice dates with"
                value={form.interestedIn}
                onValueChange={(v) => set("interestedIn", v)}
                options={[
                  { value: "women", label: "Women" },
                  { value: "men", label: "Men" },
                  { value: "anyone", label: "Anyone" },
                ]}
              />
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="What do you want to work on?" description="Your first dates will lean into these." />
            <ChipGroup
              label="Skills to work on"
              options={SKILLS.map((s) => ({ value: s.key, label: s.label }))}
              value={form.focusSkills}
              onValueChange={(v) => set("focusSkills", v as SkillName[])}
            />
            <div className="mt-4">
              <Textarea
                label="In your own words"
                description="What tends to go wrong? The more specific, the better the practice."
                placeholder="I run out of things to say after the small talk, and I get quiet when they ask about me."
                rows={4}
                value={form.focusNote}
                onChange={(e) => set("focusNote", e.target.value)}
              />
            </div>
          </Panel>

          {error && <Alert title="Couldn't save your profile" tone="danger">Your answers are still here. Try saving again.</Alert>}
          <div className="flex justify-end gap-3">
            <Button type="button" disabled={saving} variant="ghost" onClick={() => navigate(routes.DashboardRoute.build())}>
              Skip for now
            </Button>
            <Button type="submit" loading={saving}>Save and continue</Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

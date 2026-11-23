import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { getProfile, updateProfile, useQuery } from "wasp/client/operations";
import { getUserId } from "@/client/userId";
import { Alert } from "@/components/arc/alert/alert";
import { Skeleton } from "@/components/arc/skeleton/skeleton";
import type { Profile } from "../server/dto";
import { AppShell } from "@/components/AppShell";
import { PageHeader, Panel, PanelHeader } from "@/components/Panel";
import { Button } from "@/components/arc/button/button";
import { ChipGroup } from "@/components/arc/chip-group/chip-group";
import { RadioCards } from "@/components/arc/radio-cards/radio-cards";
import { Select } from "@/components/arc/select/select";
import { Textarea } from "@/components/arc/textarea/textarea";
import { Input } from "@/components/arc/input/input";
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
  return <OnboardingForm profile={profile.data} />;
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

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
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

/** What onboarding collects. The backend's saveProfile action can take this as its input. */
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
  const navigate = useNavigate();
  const [form, setForm] = useState<OnboardingInput>({
    name: "",
    goals: [],
    experience: "intermediate",
    lookingFor: "serious",
    interestedIn: "anyone",
    focusSkills: [],
    focusNote: "",
  });
  const set = <K extends keyof OnboardingInput>(key: K, value: OnboardingInput[K]) => setForm((f) => ({ ...f, [key]: value }));

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    // TODO(backend): await saveProfile(form) from "wasp/client/operations"
    console.info("onboarding", form);
    navigate(routes.DashboardRoute.build());
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
            <PanelHeader title="Preferences" description="Used to pick personas for your practice dates." />
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

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => navigate(routes.DashboardRoute.build())}>
              Skip for now
            </Button>
            <Button type="submit">Save and continue</Button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

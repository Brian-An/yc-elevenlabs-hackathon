import { ArrowRight, Brain, MessageCircleHeart, Mic, Target } from "lucide-react";
import { useNavigate } from "react-router";
import { routes } from "wasp/client/router";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/arc/button/button";
import { Badge } from "@/components/arc/badge/badge";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { personas } from "@/client/mockData";

const steps = [
  {
    icon: Mic,
    title: "Practice a real date",
    body: "Talk out loud with an AI date who has their own personality, moods and opinions. Coffee shop, gallery, loud bar.",
  },
  {
    icon: MessageCircleHeart,
    title: "Get honest feedback",
    body: "See how you did on listening, engagement, confidence and flow, with the exact lines that helped or hurt.",
  },
  {
    icon: Brain,
    title: "It remembers you",
    body: "Your strengths and weak spots carry over, so every next date is built to work on what you actually need.",
  },
];

export function LandingPage() {
  const navigate = useNavigate();
  return (
    <AppShell variant="public" wide>
      <section className="grid items-center gap-10 py-6 sm:py-12 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Badge tone="neutral" pill dot>
            Voice practice for first dates
          </Badge>
          <h1 className="mt-5 text-4xl text-foreground sm:text-5xl lg:text-[3.5rem]">
            Rehearse the date
            <br />
            <span className="text-brand">before the date.</span>
          </h1>
          <p className="mt-5 max-w-lg text-lg text-subtle">
            Have a real voice conversation with an AI date, get specific feedback on how it went, and get a follow-up date
            designed around the thing you keep tripping on.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => navigate(routes.SignupRoute.build())}>
              Start practicing <ArrowRight className="size-4" aria-hidden="true" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => navigate(routes.LoginRoute.build())}>
              I have an account
            </Button>
          </div>
        </div>

        <HeroPreview />
      </section>

      <section aria-labelledby="how" className="py-12">
        <h2 id="how" className="text-2xl text-foreground sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-(--radius-panel) border border-border bg-surface p-6">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-full bg-brand-subtle text-brand-strong">
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                <span className="text-xs text-faint">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-lg text-foreground">{title}</h3>
              <p className="mt-2 text-sm text-subtle">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-6 flex flex-col items-start gap-4 rounded-(--radius-surface) border border-border bg-surface-muted p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl text-foreground">Five minutes. No stakes. Real progress.</h2>
          <p className="mt-1 text-sm text-subtle">Your first date takes about as long as ordering a coffee.</p>
        </div>
        <Button onClick={() => navigate(routes.SignupRoute.build())}>Create your profile</Button>
      </section>
    </AppShell>
  );
}

function HeroPreview() {
  const maya = personas[0]!;
  return (
    <div className="relative rounded-(--radius-surface) border border-border bg-surface p-5 shadow-(--shadow-raised) sm:p-6" aria-hidden="true">
      <div className="flex items-center gap-3">
        <PersonaAvatar persona={maya} size={48} speaking />
        <div>
          <p className="text-sm font-medium text-foreground">
            {maya.name}, {maya.age}
          </p>
          <p className="text-xs text-subtle">Coffee shop, first date</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-2.5 py-1 text-xs text-brand-strong">
          <span className="size-1.5 animate-pulse rounded-full bg-brand" /> Live
        </span>
      </div>
      <div className="mt-5 space-y-2.5 text-sm">
        <p className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface-muted px-3.5 py-2.5 text-foreground">
          I just got back from Lisbon, so I'm a coffee snob now. Sorry in advance.
        </p>
        <p className="ml-auto max-w-[85%] rounded-2xl rounded-tr-md bg-foreground px-3.5 py-2.5 text-background">
          Nice. So what do you do for work?
        </p>
      </div>
      <div className="mt-5 rounded-(--radius-control) border border-border bg-background p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Target className="size-3.5 text-brand" /> Coach note
        </div>
        <p className="mt-1.5 text-sm text-subtle">She offered Lisbon and you moved on. Ask what surprised her there.</p>
      </div>
    </div>
  );
}

import type { ReactNode } from "react";
import type { PersonaWithScenario } from "../server/dto";
import type { PersonaProvenance } from "../shared/types";
import { Badge } from "@/components/arc/badge/badge";
import { Disclosure } from "@/components/Disclosure";
import { PersonaAvatar } from "@/components/PersonaAvatar";

const TRAIT_LABELS: Record<keyof PersonaProvenance, string> = {
  name: "name", age: "age", gender: "gender", appearance: "appearance", personality: "personality",
  interests: "interests", voice: "voice", setting: "setting",
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A generated character at a glance: who they are and one line about them. Where you meet, their first line, voice and
 * which traits came from the user stay behind "Details". `children` replaces the details, e.g. with an edit form.
 */
export function CharacterCard({ persona, actions, children }: { persona: PersonaWithScenario; actions?: ReactNode; children?: ReactNode }) {
  const custom = persona.custom;
  const traits = custom ? (Object.entries(custom.provenance) as [keyof PersonaProvenance, string][]) : [];
  const fromNotes = traits.filter(([, source]) => source === "notes").map(([trait]) => TRAIT_LABELS[trait]);
  const generated = traits.filter(([, source]) => source === "generated").map(([trait]) => TRAIT_LABELS[trait]);

  return (
    <div className="grid gap-5" aria-labelledby={`character-${persona.id}`} role="group">
      <div className="flex items-center gap-4">
        <PersonaAvatar persona={persona} size={72} />
        <div className="min-w-0 flex-1">
          <h2 id={`character-${persona.id}`} className="font-heading text-2xl text-foreground">{persona.name}, {persona.age}</h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge pill>{capitalize(persona.difficulty)}</Badge>
          </div>
        </div>
      </div>

      <p className="max-w-prose text-base text-foreground">{persona.bio}</p>

      {children ?? (
        <Disclosure label="Details">
          <dl className="grid max-w-prose gap-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)] sm:gap-x-6">
            <dt className="text-faint">Personality</dt>
            <dd className="text-foreground">{persona.personality}</dd>
            <dt className="text-faint">Where you meet</dt>
            <dd className="text-foreground">{persona.defaultScenario.setting}</dd>
            {persona.defaultScenario.openingLine && <>
              <dt className="text-faint">They open with</dt>
              <dd className="text-foreground">“{persona.defaultScenario.openingLine}”</dd>
            </>}
            {custom?.voiceName && <>
              <dt className="text-faint">Voice</dt>
              <dd className="text-foreground">{custom.voiceName}</dd>
            </>}
            {fromNotes.length > 0 && <>
              <dt className="text-faint">From you</dt>
              <dd className="text-foreground">{capitalize(fromNotes.join(", "))}</dd>
            </>}
            {custom && generated.length > 0 && <>
              <dt className="text-faint">Chosen by AI</dt>
              <dd className="text-foreground">{capitalize(generated.join(", "))}</dd>
            </>}
          </dl>
        </Disclosure>
      )}

      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

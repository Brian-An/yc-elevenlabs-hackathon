import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Persona } from "../shared/types";
import { cn } from "@/lib/utils";

const HUES: Record<string, number> = { maya: 15, theo: 250, priya: 150 };

// Stand-in realistic photos until each persona has a proper portrait asset.
const PHOTOS: Record<string, string> = {
  maya: "https://i.pravatar.cc/300?img=47",
  theo: "https://i.pravatar.cc/300?img=12",
  priya: "https://i.pravatar.cc/300?img=32",
};

function hueFor(persona: Persona) {
  return HUES[persona.id] ?? [...persona.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
}

/**
 * Persona portrait with a "speaking" state (soft rings pulse out while the agent talks).
 * Pass `src` to override the default photo; falls back to the initial on a tinted disc
 * for personas with no photo.
 */
export function PersonaAvatar({ persona, size = 64, speaking = false, src, className }: { persona: Persona; size?: number; speaking?: boolean; src?: string; className?: string }) {
  const reduce = useReducedMotion();
  const hue = hueFor(persona);
  const photo = src ?? PHOTOS[persona.id];
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      <AnimatePresence>
        {speaking &&
          !reduce &&
          [0, 1].map((i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-brand"
              initial={{ opacity: 0.5, scale: 1 }}
              animate={{ opacity: 0, scale: 1.35 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity, delay: i * 0.8, ease: "easeOut" }}
            />
          ))}
      </AnimatePresence>
      <span
        className={cn(
          "relative grid size-full place-items-center overflow-hidden rounded-full border font-heading font-medium transition-[border-color,box-shadow] duration-200",
          speaking ? "border-brand shadow-[0_0_0_3px_var(--accent-subtle)]" : "border-border",
        )}
        style={{
          background: `oklch(0.9 0.05 ${hue})`,
          color: `oklch(0.35 0.08 ${hue})`,
          fontSize: size * 0.4,
        }}
      >
        {photo ? <img src={photo} alt="" className="size-full object-cover" /> : persona.name[0]}
      </span>
      <span className="sr-only">{speaking ? `${persona.name} is speaking` : persona.name}</span>
    </span>
  );
}

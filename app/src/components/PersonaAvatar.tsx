import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Persona } from "../shared/types";
import { cn } from "@/lib/utils";

const HUES: Record<string, number> = { maya: 15, theo: 250, priya: 150 };

function hueFor(persona: Persona) {
  return HUES[persona.id] ?? [...persona.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
}

/**
 * Persona portrait with a "speaking" state (soft rings pulse out while the agent talks).
 * Pass `src` once personas have images; until then it shows the initial on a tinted disc.
 */
export function PersonaAvatar({ persona, size = 64, speaking = false, src, className }: { persona: Persona; size?: number; speaking?: boolean; src?: string; className?: string }) {
  const reduce = useReducedMotion();
  const hue = hueFor(persona);
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
        {src ? <img src={src} alt="" className="size-full object-cover" /> : persona.name[0]}
      </span>
      <span className="sr-only">{speaking ? `${persona.name} is speaking` : persona.name}</span>
    </span>
  );
}

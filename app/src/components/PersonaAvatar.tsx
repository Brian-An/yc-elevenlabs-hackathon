import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Persona } from "../shared/types";
import { cn } from "@/lib/utils";

const HUES: Record<string, number> = { maya: 15, theo: 250, priya: 150 };

function hueFor(persona: Persona) {
  return HUES[persona.id] ?? [...persona.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 360;
}

/** Sound waves ripple out this often while the persona talks. */
const WAVE_COUNT = 3;
const WAVE_SECONDS = 1.8;

/**
 * Persona portrait with a "speaking" state: sound waves ripple out while the agent talks, and with `volume`
 * (0-1, read every frame) a halo behind the portrait swells with their voice.
 * Pass `src` to override the default photo; falls back to the initial on a tinted disc
 * for personas with no photo.
 */
export function PersonaAvatar({
  persona,
  size = 64,
  speaking = false,
  volume,
  src,
  className,
}: {
  persona: Persona;
  size?: number;
  speaking?: boolean;
  volume?: () => number;
  src?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const halo = useRef<HTMLSpanElement>(null);

  // Written straight to the element each frame, so the halo tracks the voice without re-rendering.
  useEffect(() => {
    const el = halo.current;
    if (!el || !volume || !speaking || reduce) return;
    let level = 0;
    let frame = requestAnimationFrame(function tick() {
      // Speech output rarely passes 0.5, so stretch it to fill the range, then ease toward it to stop jitter.
      const target = Math.min(1, volume() * 2);
      level += (target - level) * 0.25;
      el.style.transform = `scale(${1 + level * 0.2})`;
      el.style.opacity = String(0.12 + level * 0.3);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      el.style.transform = "";
      el.style.opacity = "";
    };
  }, [volume, speaking, reduce]);

  const hue = hueFor(persona);
  // The portrait is the video avatar the persona appears as on a call, so the photo and the call match.
  const photo = src ?? persona.photoUrl ?? persona.custom?.avatarPreviewUrl ?? undefined;
  return (
    <span className={cn("relative inline-grid shrink-0 place-items-center", className)} style={{ width: size, height: size }}>
      {volume && speaking && !reduce && (
        <span ref={halo} aria-hidden="true" className="absolute inset-0 rounded-full bg-brand opacity-0 blur-xl" />
      )}
      <AnimatePresence>
        {speaking &&
          !reduce &&
          Array.from({ length: WAVE_COUNT }, (_, i) => (
            <motion.span
              key={i}
              aria-hidden="true"
              className="absolute inset-0 rounded-full border-2 border-brand"
              initial={{ opacity: 0, scale: 1 }}
              animate={{ opacity: [0.7, 0], scale: [1, 1.7] }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: WAVE_SECONDS, repeat: Infinity, delay: (i * WAVE_SECONDS) / WAVE_COUNT, ease: "easeOut" }}
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

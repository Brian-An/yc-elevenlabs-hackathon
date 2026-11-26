import { useEffect, useRef } from "react";
import type { PersonaWithScenario } from "../server/dto";
import type { WorldBus } from "@/world/bus";
import { BOUNDS, COACH_ID, STUDIO, TABLES, seats } from "@/world/layout";
import { cn } from "@/lib/utils";

/** The studio mat's pink, shared with the mat in the scene so the two read as the same place. */
const STUDIO_COLOR = "#e58bbd";
const PAD = 1.5;
const VIEW = {
  x: BOUNDS.minX - PAD,
  y: BOUNDS.minZ - PAD,
  w: BOUNDS.maxX - BOUNDS.minX + PAD * 2,
  h: BOUNDS.maxZ - BOUNDS.minZ + PAD * 2,
};

/**
 * A north-up map of the plaza in the corner of the world: where you are and which way you face, every date waiting
 * at a table, the coach, and the studio. Plaza metres map straight onto the SVG (x east, z south).
 */
export function WorldMap({ personas, bus, nearby, className }: {
  personas: readonly PersonaWithScenario[];
  bus: WorldBus;
  nearby: string | null;
  className?: string;
}) {
  const player = useRef<SVGGElement>(null);

  // The player moves every frame; move the marker directly rather than re-rendering the map.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      // A shape pointing down (+z) turned by -yaw points the way the player faces.
      player.current?.setAttribute("transform", `translate(${bus.player.x} ${bus.player.z}) rotate(${(-bus.playerYaw * 180) / Math.PI})`);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [bus]);

  const placed = personas.slice(0, TABLES.length).map((persona, i) => ({ persona, spot: seats(TABLES[i]!).waiting }));
  const coach = placed.find(({ persona }) => persona.id === COACH_ID);
  const dates = placed.filter(({ persona }) => persona.id !== COACH_ID);

  return (
    <figure className={cn("rounded-(--radius-panel) border border-border bg-surface/90 p-2 shadow-(--shadow-resting) backdrop-blur-sm", className)}>
      <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block w-full" role="img"
        aria-label={`Map of the plaza: ${dates.length} ${dates.length === 1 ? "date" : "dates"} at café tables${coach ? `, ${coach.persona.name} the coach on the ${side(coach.spot.x)} side` : ""}, and the studio on the east side.`}>
        <rect x={BOUNDS.minX} y={BOUNDS.minZ} width={BOUNDS.maxX - BOUNDS.minX} height={BOUNDS.maxZ - BOUNDS.minZ} rx={1.5}
          className="fill-surface-muted stroke-border" strokeWidth={0.25} />
        {/* Every table, then the people waiting at them. */}
        {TABLES.map((t) => <circle key={t.id} cx={t.x} cy={t.z} r={0.7} className="fill-border" />)}
        {dates.map(({ persona, spot }) => (
          <circle key={persona.id} cx={spot.x} cy={spot.z} r={nearby === persona.id ? 1.3 : 1}
            className="fill-foreground stroke-surface" strokeWidth={0.35}>
            <title>{persona.name}</title>
          </circle>
        ))}
        {coach && (() => {
          const half = nearby === COACH_ID ? 1.4 : 1.1;
          return (
            <rect x={coach.spot.x - half} y={coach.spot.z - half} width={half * 2} height={half * 2} rx={0.4} className="fill-info stroke-surface" strokeWidth={0.35}>
              <title>{coach.persona.name}, the coach</title>
            </rect>
          );
        })()}
        <rect x={STUDIO.x - 1.2} y={STUDIO.z - 1.2} width={2.4} height={2.4} fill={STUDIO_COLOR} className="stroke-surface" strokeWidth={0.35}
          transform={`rotate(45 ${STUDIO.x} ${STUDIO.z})`}>
          <title>Studio</title>
        </rect>
        <g ref={player}>
          <path d="M 0 1.6 L 1.2 -1 L 0 -0.4 L -1.2 -1 Z" className="fill-foreground stroke-surface" strokeWidth={0.3} />
        </g>
      </svg>
      <figcaption className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 px-0.5 text-[11px] leading-none text-subtle">
        <Legend shape="arrow">You</Legend>
        <Legend shape="dot">Dates</Legend>
        <Legend shape="square">Coach</Legend>
        <Legend shape="diamond">Studio</Legend>
      </figcaption>
    </figure>
  );
}

function side(x: number) {
  return x < -4 ? "west" : x > 4 ? "east" : "middle";
}

function Legend({ shape, children }: { shape: "arrow" | "dot" | "square" | "diamond"; children: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg viewBox="-1.5 -1.5 3 3" className="size-2.5" aria-hidden="true">
        {shape === "arrow" && <path d="M 0 -1.4 L 1.2 1 L 0 0.4 L -1.2 1 Z" className="fill-foreground" />}
        {shape === "dot" && <circle r={1.2} className="fill-foreground" />}
        {shape === "square" && <rect x={-1.2} y={-1.2} width={2.4} height={2.4} rx={0.4} className="fill-info" />}
        {shape === "diamond" && <rect x={-1} y={-1} width={2} height={2} fill={STUDIO_COLOR} transform="rotate(45)" />}
      </svg>
      {children}
    </span>
  );
}

import { useCallback, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import type { Persona } from "../shared/types";
import { Character, type Clip } from "./Character";
import { turnToward, yawTo, type Collider } from "./collision";
import type { WorldBus } from "./bus";
import { BOUNDS, CHARACTER_HEIGHT, CHARACTER_RADIUS, PERSONA_LOOK, WAYPOINTS, seats, type Table } from "./layout";
import type { NavGrid } from "./navigation";
import { leaveSeat, seatPath, stepSeatApproach, stepSeatExit, stepToward } from "./seating";
import { createStroller, STROLL_SPEED, stepStroller, type Stroller } from "./stroll";

const LOOK_RADIUS = 7; // a waiting persona turns toward the player inside this distance

/** Clip state that only re-renders when the clip actually changes. */
function useClip(initial: Clip) {
  const [clip, setClip] = useState<Clip>(initial);
  const ref = useRef<Clip>(initial);
  const play = (next: Clip) => {
    if (ref.current === next) return;
    ref.current = next;
    setClip(next);
  };
  return [clip, play, ref] as const;
}

/**
 * A passer-by: strolls to a random waypoint along a path round the tables, lingers 2-5 s, picks another.
 * Slides round other people and the player, and changes course when they block the way.
 */
export function Extra({ model, start, index, bus, nav }: { model: string; start: number; index: number; bus: WorldBus; nav: NavGrid }) {
  const group = useRef<Group>(null);
  const [clip, play] = useClip("Idle");
  const state = useRef<Stroller | null>(null);
  if (!state.current) {
    state.current = createStroller(index, start, WAYPOINTS);
    bus.extras[index] = { x: state.current.x, z: state.current.z };
  }

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const s = state.current!;
    const g = group.current;
    if (!g) return;
    const people: Collider[] = [{ kind: "circle", x: bus.player.x, z: bus.player.z, r: CHARACTER_RADIUS }];
    bus.extras.forEach((e, i) => {
      if (i !== index) people.push({ kind: "circle", x: e.x, z: e.z, r: CHARACTER_RADIUS });
    });
    const walking = stepStroller(s, dt, WAYPOINTS, nav, nav.colliders, people, BOUNDS, CHARACTER_RADIUS);
    play(walking ? "Walk" : "Idle");
    bus.extras[index] = { x: s.x, z: s.z };
    g.position.set(s.x, 0, s.z);
    g.rotation.y = s.yaw;
  });

  return <Character model={model} clip={clip} groupRef={group} />;
}

/**
 * A date persona. Waits beside their table with a name tag and turns toward the player when they come close.
 * On a date with them: walks to the far chair, sits, and talks with `bus.voice`.
 */
export function DatePersona({
  persona,
  model,
  table,
  bus,
  nav,
  onDate,
  nearby,
}: {
  persona: Persona;
  model: string;
  table: Table;
  bus: WorldBus;
  nav: NavGrid;
  onDate: boolean;
  nearby: boolean;
}) {
  const group = useRef<Group>(null);
  const [clip, play, clipRef] = useClip("Idle");
  const spot = seats(table);
  const pos = useRef({ x: spot.waiting.x, z: spot.waiting.z, yaw: spot.waiting.yaw });
  const seated = useRef(false);
  const route = useRef<ReturnType<typeof seatPath> | null>(null);
  const stood = useRef(false);
  const onSit = useCallback(() => {
    bus.seated.persona = true;
  }, [bus]);
  const onStand = useCallback(() => {
    stood.current = true;
  }, []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = group.current;
    if (!g) return;
    const p = pos.current;
    if (onDate) {
      const seat = spot.persona;
      if (!seated.current) {
        if (route.current?.leaving) route.current = null;
        const approach = route.current ??= seatPath(nav, p, seat);
        const step = stepSeatApproach(p, p.yaw, approach, STROLL_SPEED * dt, 8 * dt);
        p.yaw = step.yaw;
        if (step.ready) {
          seated.current = true;
          play("SitDown");
        } else {
          play(step.walking ? "Walk" : "Idle");
        }
      }
    } else {
      if (seated.current) {
        // The date ended: stand, then stroll back to the waiting spot.
        seated.current = false;
        bus.seated.persona = false;
        stood.current = false;
        play("StandUp");
      }
      route.current = leaveSeat(route.current);
      if (clipRef.current === "StandUp" && !stood.current) return;
      const home = spot.waiting;
      const heading = route.current ? stepSeatExit(p, route.current, STROLL_SPEED * dt) : stepToward(p, home, STROLL_SPEED * dt);
      if (heading !== null) {
        p.yaw = turnToward(p.yaw, heading, 8 * dt);
        play("Walk");
      } else if (!route.current) {
        const toPlayer = Math.hypot(bus.player.x - p.x, bus.player.z - p.z);
        const want = toPlayer < LOOK_RADIUS ? yawTo(p, bus.player) : home.yaw;
        p.yaw = turnToward(p.yaw, want, 3 * dt);
        play("Idle");
      } else {
        play("Idle");
      }
      if (route.current?.path.length === 0) route.current = null;
    }
    g.position.set(p.x, 0, p.z);
    g.rotation.y = p.yaw;
  });

  return (
    <group>
      <Character
        model={model}
        {...PERSONA_LOOK[persona.id]}
        clip={clip}
        groupRef={group}
        voice={onDate ? () => bus.voice() : undefined}
        onSit={onDate ? onSit : undefined}
        onStand={onStand}
      />
      {!onDate && (
        <Html position={[spot.waiting.x, CHARACTER_HEIGHT + 0.45, spot.waiting.z]} center zIndexRange={[10, 0]} pointerEvents="none">
          <div
            className={
              "whitespace-nowrap rounded-full border px-3 py-1 text-center text-sm shadow-(--shadow-resting) transition-colors " +
              (nearby ? "border-brand bg-brand text-accent-foreground" : "border-border bg-surface/90 text-foreground")
            }
          >
            <span className="font-medium">{persona.name}</span>
            <span className={nearby ? "opacity-85" : "text-subtle"}>, {persona.age}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

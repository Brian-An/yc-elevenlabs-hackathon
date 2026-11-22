import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3, type Group } from "three";
import { Character, type Clip } from "./Character";
import { resolve, turnToward, yawTo, type Collider } from "./collision";
import { isTyping, MOVE_KEYS } from "./controls";
import type { WorldBus, WorldDate } from "./bus";
import { BOUNDS, CHARACTER_RADIUS, COLLIDERS, PLAYER, TABLES, TALK_RADIUS, seats } from "./layout";
import type { NavGrid } from "./navigation";
import { leaveSeat, seatPath, stepSeatApproach, stepSeatExit } from "./seating";

const WALK_SPEED = 1.9; // m/s
const RUN_SPEED = 4.4;
const TURN_SPEED = 10; // rad/s
const CAMERA_DISTANCE = 6.5;
const PITCH_MIN = 0.12;
const PITCH_MAX = 1.1;
/** Pointer travel, in pixels, past which a press is a camera drag rather than a tap to walk. */
const DRAG_THRESHOLD = 5;

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The player's character and the third-person camera.
 * Explore: WASD or arrows to walk (Shift runs), drag to look around, tap or click the ground to walk there.
 * Date: walks to the near chair at the date's table and sits; the camera settles over the shoulder.
 */
export function Player({
  bus,
  date,
  waiting,
  nav,
  onNearby,
}: {
  bus: WorldBus;
  date: WorldDate | null;
  /** Where each date persona is waiting, by persona id. */
  waiting: ReadonlyMap<string, { x: number; z: number }>;
  nav: NavGrid;
  onNearby: (personaId: string | null) => void;
}) {
  const group = useRef<Group>(null);
  const [clip, setClip] = useState<Clip>("Idle");
  const clipRef = useRef<Clip>("Idle");
  const play = (next: Clip) => {
    if (clipRef.current === next) return;
    clipRef.current = next;
    setClip(next);
  };

  const pos = useMemo(() => ({ ...PLAYER.spawn }), []);
  const yaw = useRef(PLAYER.yaw);
  const view = useRef({ yaw: PLAYER.yaw + Math.PI, pitch: 0.38 });
  const held = useRef(new Set<string>());
  const running = useRef(false);
  const nearby = useRef<string | null>(null);
  const seated = useRef(false);
  const route = useRef<ReturnType<typeof seatPath> | null>(null);
  const stood = useRef(false);
  const onSit = useCallback(() => {
    bus.seated.player = true;
  }, [bus]);
  const onStand = useCallback(() => {
    stood.current = true;
  }, []);

  // Keyboard: movement keys while exploring.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      running.current = e.shiftKey;
      if (e.code in MOVE_KEYS) {
        held.current.add(e.code);
        bus.moveTarget = null;
        // Arrow keys would otherwise scroll the page.
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      running.current = e.shiftKey;
      held.current.delete(e.code);
    };
    const clear = () => held.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [bus]);

  // Pointer: drag anywhere on the canvas to turn the camera. Taps fall through to the ground's onClick.
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let last: { x: number; y: number } | null = null;
    let travel = 0;
    const down = (e: PointerEvent) => {
      last = { x: e.clientX, y: e.clientY };
      travel = 0;
    };
    const move = (e: PointerEvent) => {
      if (!last) return;
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      travel += Math.abs(dx) + Math.abs(dy);
      if (travel < DRAG_THRESHOLD) return;
      if (!el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
      view.current.yaw -= dx * 0.006;
      view.current.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, view.current.pitch + dy * 0.004));
    };
    const up = (e: PointerEvent) => {
      last = null;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  // Leave the chair sideways before handing movement back to the plaza colliders.
  useLayoutEffect(() => {
    bus.moveTarget = null;
    held.current.clear();
    bus.seated.player = false;
    if (date) {
      route.current = null;
      nearby.current = null;
      onNearby(null);
      return;
    }
    if (seated.current) {
      seated.current = false;
      stood.current = false;
      play("StandUp");
    }
    route.current = leaveSeat(route.current);
  }, [date, bus, onNearby]);

  const camera = useThree((s) => s.camera);
  const lookAt = useMemo(() => new Vector3(), []);
  const wantCam = useMemo(() => new Vector3(), []);
  const aim = useMemo(() => new Vector3(), []);
  const firstFrame = useRef(true);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const g = group.current;
    if (!g) return;
    let speed = 0;

    if (date) {
      const seat = seats(TABLES[date.tableIndex]!).player;
      if (!seated.current) {
        const approach = route.current ??= seatPath(nav, pos, seat);
        const step = stepSeatApproach(pos, yaw.current, approach, WALK_SPEED * dt, TURN_SPEED * dt);
        yaw.current = step.yaw;
        if (step.ready) {
          seated.current = true;
          play("SitDown");
        } else if (step.walking) {
          speed = WALK_SPEED;
        }
      }
    } else if (route.current) {
      if (route.current.leaving && (clipRef.current !== "StandUp" || stood.current)) {
        const heading = stepSeatExit(pos, route.current, WALK_SPEED * dt);
        if (heading !== null) yaw.current = turnToward(yaw.current, heading, TURN_SPEED * dt);
        play(heading === null ? "Idle" : "Walk");
        if (route.current.path.length === 0) route.current = null;
      }
    } else {
      // Keyboard direction, relative to where the camera looks.
      let ix = 0;
      let iz = 0;
      for (const code of held.current) {
        const [x, z] = MOVE_KEYS[code]!;
        ix += x;
        iz += z;
      }
      let dirX = 0;
      let dirZ = 0;
      if (ix || iz) {
        const forwardX = -Math.sin(view.current.yaw);
        const forwardZ = -Math.cos(view.current.yaw);
        // Right of forward, on the ground plane.
        dirX = forwardX * iz - forwardZ * ix;
        dirZ = forwardZ * iz + forwardX * ix;
      } else if (bus.moveTarget) {
        dirX = bus.moveTarget.x - pos.x;
        dirZ = bus.moveTarget.z - pos.z;
        if (Math.hypot(dirX, dirZ) < 0.15) {
          bus.moveTarget = null;
          dirX = dirZ = 0;
        }
      }
      const len = Math.hypot(dirX, dirZ);
      if (len > 0) {
        speed = running.current ? RUN_SPEED : WALK_SPEED;
        pos.x += (dirX / len) * speed * dt;
        pos.z += (dirZ / len) * speed * dt;
        yaw.current = turnToward(yaw.current, Math.atan2(dirX, dirZ), TURN_SPEED * dt);
      }
      const people: Collider[] = [
        ...[...waiting.values()].map((w) => ({ kind: "circle" as const, x: w.x, z: w.z, r: CHARACTER_RADIUS })),
        ...bus.extras.map((e) => ({ kind: "circle" as const, x: e.x, z: e.z, r: CHARACTER_RADIUS })),
      ];
      const before = { x: pos.x, z: pos.z };
      resolve(pos, CHARACTER_RADIUS, [...COLLIDERS, ...people], BOUNDS);
      // A tap target behind an obstacle would leave the player pushing against it forever.
      if (bus.moveTarget && len > 0 && Math.hypot(pos.x - before.x, pos.z - before.z) > speed * dt * 0.8) bus.moveTarget = null;

      // The nearest waiting persona within reach, for the "Talk to" prompt.
      let best: string | null = null;
      let bestD = TALK_RADIUS;
      for (const [id, w] of waiting) {
        const d = Math.hypot(w.x - pos.x, w.z - pos.z);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
      if (best !== nearby.current) {
        nearby.current = best;
        onNearby(best);
      }

      play(speed === 0 ? "Idle" : speed > WALK_SPEED ? "Run" : "Walk");
    }
    if (date && !seated.current) play(speed > 0 ? "Walk" : "Idle");

    g.position.set(pos.x, 0, pos.z);
    g.rotation.y = yaw.current;
    bus.player.x = pos.x;
    bus.player.z = pos.z;

    // Camera
    const snap = firstFrame.current || prefersReducedMotion();
    firstFrame.current = false;
    if (date && bus.closeUp) {
      // Push in on the persona's face from across the table; the avatar stage fades in over this.
      const s = seats(TABLES[date.tableIndex]!);
      const towardPlayer = yawTo(s.persona, s.player);
      wantCam.set(s.persona.x + Math.sin(towardPlayer) * 1.25, 1.3, s.persona.z + Math.cos(towardPlayer) * 1.25);
      lookAt.set(s.persona.x, 1.12, s.persona.z);
    } else if (date) {
      // Over the player's shoulder, framing the persona across the table.
      const s = seats(TABLES[date.tableIndex]!);
      const facing = yawTo(s.player, s.persona);
      // High and to the side, so the player's head and the table decorations stay below the persona's face.
      const back = 2.6;
      const side = 1.55;
      wantCam.set(
        s.player.x - Math.sin(facing) * back + Math.cos(facing) * side,
        2.7,
        s.player.z - Math.cos(facing) * back - Math.sin(facing) * side,
      );
      lookAt.set(s.persona.x, 0.88, s.persona.z + 0.45);
    } else {
      const { yaw: vy, pitch } = view.current;
      const horizontal = Math.cos(pitch) * CAMERA_DISTANCE;
      wantCam.set(pos.x + Math.sin(vy) * horizontal, 1.5 + Math.sin(pitch) * CAMERA_DISTANCE, pos.z + Math.cos(vy) * horizontal);
      lookAt.set(pos.x, 1.3, pos.z);
    }
    if (snap) {
      camera.position.copy(wantCam);
      aim.copy(lookAt);
    } else {
      const k = 1 - Math.exp(-dt * (date ? (bus.closeUp ? 1.8 : 2.5) : 8));
      camera.position.lerp(wantCam, k);
      aim.lerp(lookAt, k);
    }
    camera.lookAt(aim);
  });

  return <Character model={PLAYER.model} clip={clip} groupRef={group} onSit={date ? onSit : undefined} onStand={onStand} />;
}

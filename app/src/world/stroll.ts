/**
 * A passer-by's wandering: pick a waypoint, follow a path round the static obstacles, linger, repeat.
 * Kept free of React and three.js so a whole crowd can be simulated in tests.
 */
import { resolve, turnToward, type Bounds, type Collider, type Vec2 } from "./collision";
import type { NavGrid } from "./navigation";

export const STROLL_SPEED = 1.15; // m/s, a little slower than the player's walk
const ARRIVE = 0.3; // close enough to a path point to head for the next
// Other people can block a path. Without this much progress in this long, give up and wander somewhere else.
const STALL_DISTANCE = 0.5;
const STALL_SECONDS = 2;
const CROWDED_ARRIVE = 1.2; // close enough to a destination someone else is standing on
const RECHECK_SECONDS = 0.5; // how often to check the way ahead is still clear
const LOOKAHEAD = 1.5; // metres ahead to start stepping round someone

export type Stroller = {
  x: number;
  z: number;
  yaw: number;
  /** Index into the waypoints of where the stroller is heading or lingering. */
  target: number;
  path: Vec2[];
  /** Seconds left to linger; while positive the stroller stands still. */
  wait: number;
  /** Where progress was last measured from, and how long ago. */
  mark: Vec2;
  stalled: number;
  /** Seconds until the way to the next path point is checked again. */
  recheck: number;
  rand: () => number;
};

/** Deterministic per-character randomness, so a reload looks the same. */
export function seeded(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function createStroller(index: number, start: number, waypoints: readonly Vec2[]): Stroller {
  const rand = seeded(index + 1);
  const p = waypoints[start % waypoints.length]!;
  return { x: p.x, z: p.z, yaw: rand() * Math.PI * 2, target: start, path: [], wait: rand() * 3, mark: { x: p.x, z: p.z }, stalled: 0, recheck: 0, rand };
}

/**
 * Advances `s` by `dt` seconds and returns whether it is walking. `people` are the moving characters to slide round;
 * `nav` already routes round the static `colliders`.
 */
export function stepStroller(
  s: Stroller,
  dt: number,
  waypoints: readonly Vec2[],
  nav: NavGrid,
  colliders: readonly Collider[],
  people: readonly Collider[],
  bounds: Bounds,
  r: number,
): boolean {
  let walking = false;
  if (s.wait > 0) {
    s.wait -= dt;
    if (s.wait <= 0) setOff(s, waypoints, nav);
  } else {
    // Skip path points already reached, so a shove past one doesn't send the stroller back for it.
    while (s.path.length && reached(s, s.path[0]!, s.path.length === 1, people, r)) s.path.shift();
    // Sidestepping and shoves knock the stroller off its path, and the straight line to the next corner can then
    // cut into the pocket between a table and its waiting persona, so replan when that line is blocked.
    if (s.path.length && (s.recheck -= dt) <= 0) {
      s.recheck = RECHECK_SECONDS;
      if (!nav.clear(s, s.path[0]!)) s.path = nav.findPath(s, waypoints[s.target]!);
    }
    const next = s.path[0];
    if (!next) {
      s.wait = 2 + s.rand() * 3;
    } else {
      const d = Math.hypot(next.x - s.x, next.z - s.z);
      const { x: dx, z: dz } = sidestep(s, { x: (next.x - s.x) / d, z: (next.z - s.z) / d }, people, r);
      s.x += dx * STROLL_SPEED * dt;
      s.z += dz * STROLL_SPEED * dt;
      s.yaw = turnToward(s.yaw, Math.atan2(dx, dz), 6 * dt);
      walking = true;
    }
  }

  resolve(s, r, [...colliders, ...people], bounds);

  if (!walking || Math.hypot(s.x - s.mark.x, s.z - s.mark.z) > STALL_DISTANCE) {
    s.mark = { x: s.x, z: s.z };
    s.stalled = 0;
  } else if ((s.stalled += dt) > STALL_SECONDS) {
    s.mark = { x: s.x, z: s.z };
    s.stalled = 0;
    setOff(s, waypoints, nav);
  }
  return walking;
}

/** Whether `s` has reached path point `p`. Someone already standing on the destination means near is close enough. */
function reached(s: Vec2, p: Vec2, last: boolean, people: readonly Collider[], r: number) {
  const d = Math.hypot(p.x - s.x, p.z - s.z);
  if (d < ARRIVE) return true;
  return last && d < CROWDED_ARRIVE && people.some((o) => o.kind === "circle" && Math.hypot(o.x - p.x, o.z - p.z) < r + o.r);
}

/**
 * Bends the unit heading `dir` away from people just ahead, so two strollers meeting head-on pass each other
 * instead of pushing chest to chest. Each veers the same way relative to its own heading, so facing pairs veer apart.
 */
function sidestep(p: Vec2, dir: Vec2, people: readonly Collider[], r: number): Vec2 {
  const side = { x: dir.z, z: -dir.x };
  let x = dir.x;
  let z = dir.z;
  for (const o of people) {
    if (o.kind !== "circle") continue;
    const rx = o.x - p.x;
    const rz = o.z - p.z;
    const ahead = rx * dir.x + rz * dir.z;
    const lateral = rx * side.x + rz * side.z;
    if (ahead <= 0 || ahead > LOOKAHEAD || Math.abs(lateral) > r + o.r + 0.1) continue;
    // Away from the side the other person is on; dead ahead counts as on the other side.
    const away = lateral > 0 ? -1 : 1;
    const weight = 1 - ahead / LOOKAHEAD;
    x += side.x * away * weight;
    z += side.z * away * weight;
  }
  const len = Math.hypot(x, z);
  return len > 1e-6 ? { x: x / len, z: z / len } : dir;
}

/** Heads for a different, reachable waypoint than the current one. */
function setOff(s: Stroller, waypoints: readonly Vec2[], nav: NavGrid) {
  for (let attempt = 0; attempt < waypoints.length; attempt++) {
    let next = s.target;
    while (next === s.target) next = Math.floor(s.rand() * waypoints.length);
    const path = nav.findPath(s, waypoints[next]!);
    if (path.length) {
      s.target = next;
      s.path = path;
      return;
    }
  }
  // Nowhere reachable: linger and try again.
  s.wait = 1;
}

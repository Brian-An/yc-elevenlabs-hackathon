/**
 * Flat-ground collision for the plaza: characters are circles on the XZ plane, obstacles are circles
 * (tables, trees, lamps) or axis-aligned boxes (buildings, benches, cars), and the walkable area is a rectangle.
 * The world has no slopes or jumps, so this replaces a physics engine.
 */

export type Vec2 = { x: number; z: number };

export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number };

export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Moves a circle of radius `r` at `p` out of every collider and back inside `bounds`. Mutates and returns `p`. */
export function resolve(p: Vec2, r: number, colliders: readonly Collider[], bounds: Bounds): Vec2 {
  // Pushing out of one obstacle can push into its neighbour, so repeat until a pass moves nothing.
  // A gap narrower than the character takes a few passes to squeeze it out the open side.
  for (let pass = 0; pass < 8; pass++) {
    const startX = p.x;
    const startZ = p.z;
    for (const c of colliders) {
      if (c.kind === "circle") {
        const dx = p.x - c.x;
        const dz = p.z - c.z;
        const min = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        // Dead centre: push out along +x so the result is still deterministic.
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        p.x = c.x + nx * min;
        p.z = c.z + nz * min;
      } else {
        const cx = Math.min(Math.max(p.x, c.minX), c.maxX);
        const cz = Math.min(Math.max(p.z, c.minZ), c.maxZ);
        const dx = p.x - cx;
        const dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-12) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: leave through the nearest face.
          const exits = [
            { d: p.x - c.minX, x: c.minX - r, z: p.z },
            { d: c.maxX - p.x, x: c.maxX + r, z: p.z },
            { d: p.z - c.minZ, x: p.x, z: c.minZ - r },
            { d: c.maxZ - p.z, x: p.x, z: c.maxZ + r },
          ];
          const exit = exits.reduce((a, b) => (b.d < a.d ? b : a));
          p.x = exit.x;
          p.z = exit.z;
        }
      }
    }
    p.x = Math.min(Math.max(p.x, bounds.minX + r), bounds.maxX - r);
    p.z = Math.min(Math.max(p.z, bounds.minZ + r), bounds.maxZ - r);
    if (Math.abs(p.x - startX) < 1e-6 && Math.abs(p.z - startZ) < 1e-6) break;
  }
  return p;
}

/** Shortest signed difference from angle `a` to angle `b`, in (-π, π]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Turns `from` toward `to` by at most `maxStep` radians. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const d = angleDelta(from, to);
  return Math.abs(d) <= maxStep ? to : from + Math.sign(d) * maxStep;
}

/** The yaw (rotation about +Y) that faces a character from `from` toward `to`; models face +Z at yaw 0. */
export function yawTo(from: Vec2, to: Vec2): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

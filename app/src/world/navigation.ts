/**
 * Pathfinding for the passers-by: A* over a grid of the walkable area, with every static obstacle inflated by the
 * character's radius, so a path never leads into a pocket that collision alone can't slide out of.
 */
import type { Bounds, Collider, Vec2 } from "./collision";

export type NavGrid = {
  /** The static obstacles the grid routes round. */
  colliders: readonly Collider[];
  /** Corner points from `from` to `to` (excluding `from`), or an empty list when `to` is unreachable. */
  findPath(from: Vec2, to: Vec2): Vec2[];
  /** Whether a character can walk straight from `a` to `b` without entering an obstacle's margin. */
  clear(a: Vec2, b: Vec2): boolean;
};

const CELL = 0.25; // metres per grid cell
const CLEARANCE = 0.1; // extra room kept from obstacles, so paths don't scrape them

/** Builds a grid for a character of radius `r` among `colliders`, inside `bounds`. */
export function createNavGrid(colliders: readonly Collider[], bounds: Bounds, r: number): NavGrid {
  const cols = Math.floor((bounds.maxX - bounds.minX) / CELL);
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / CELL);
  const pad = r + CLEARANCE;
  const centre = (i: number): Vec2 => ({ x: bounds.minX + ((i % cols) + 0.5) * CELL, z: bounds.minZ + (Math.floor(i / cols) + 0.5) * CELL });

  const blocked = new Uint8Array(cols * rows);
  for (let i = 0; i < blocked.length; i++) {
    const p = centre(i);
    if (p.x < bounds.minX + pad || p.x > bounds.maxX - pad || p.z < bounds.minZ + pad || p.z > bounds.maxZ - pad) {
      blocked[i] = 1;
      continue;
    }
    for (const c of colliders) {
      if (overlaps(p, pad, c)) {
        blocked[i] = 1;
        break;
      }
    }
  }

  const cellOf = (p: Vec2) => {
    const cx = Math.min(Math.max(Math.floor((p.x - bounds.minX) / CELL), 0), cols - 1);
    const cz = Math.min(Math.max(Math.floor((p.z - bounds.minZ) / CELL), 0), rows - 1);
    return cz * cols + cx;
  };

  /** The free cell nearest `start`, by breadth-first search, for points pushed into an obstacle's margin. */
  const nearestFree = (start: number) => {
    if (!blocked[start]) return start;
    const seen = new Uint8Array(blocked.length);
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head]!;
      if (!blocked[i]) return i;
      for (const n of neighbours(i, cols, rows)) {
        if (!seen[n.i]) {
          seen[n.i] = 1;
          queue.push(n.i);
        }
      }
    }
    return -1;
  };

  /** Whether the straight segment a-b crosses only free cells. */
  const clear = (a: Vec2, b: Vec2) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (CELL / 2));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (blocked[cellOf({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })]) return false;
    }
    return true;
  };

  return {
    colliders,
    clear,
    findPath(from, to) {
      const start = nearestFree(cellOf(from));
      const goal = nearestFree(cellOf(to));
      if (start < 0 || goal < 0) return [];
      const cells = search(start, goal, blocked, cols, rows);
      if (!cells) return [];

      // String-pull: keep only the corners where a straight walk would leave free ground.
      const points = cells.map(centre);
      points[points.length - 1] = blocked[cellOf(to)] ? points[points.length - 1]! : { x: to.x, z: to.z };
      const path: Vec2[] = [];
      let anchor = blocked[cellOf(from)] ? points[0]! : from;
      if (anchor !== from) path.push(anchor);
      for (let i = 1; i < points.length; i++) {
        if (!clear(anchor, points[i]!)) {
          anchor = points[i - 1]!;
          path.push(anchor);
        }
      }
      path.push(points[points.length - 1]!);
      return path;
    },
  };
}

function overlaps(p: Vec2, r: number, c: Collider) {
  if (c.kind === "circle") return Math.hypot(p.x - c.x, p.z - c.z) < r + c.r;
  const cx = Math.min(Math.max(p.x, c.minX), c.maxX);
  const cz = Math.min(Math.max(p.z, c.minZ), c.maxZ);
  return Math.hypot(p.x - cx, p.z - cz) < r;
}

/** The 8 neighbours of cell `i`, with the cost of stepping to each. */
function* neighbours(i: number, cols: number, rows: number) {
  const x = i % cols;
  const z = Math.floor(i / cols);
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = x + dx;
      const nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      yield { i: nz * cols + nx, dx, dz, cost: dx && dz ? Math.SQRT2 : 1 };
    }
  }
}

/** A* from `start` to `goal`; the cells along the way, both included, or null when there is no way through. */
function search(start: number, goal: number, blocked: Uint8Array, cols: number, rows: number): number[] | null {
  const gx = goal % cols;
  const gz = Math.floor(goal / cols);
  // Octile distance: exact on an open 8-connected grid, so A* stays optimal.
  const h = (i: number) => {
    const dx = Math.abs((i % cols) - gx);
    const dz = Math.abs(Math.floor(i / cols) - gz);
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  };
  const cost = new Float64Array(blocked.length).fill(Infinity);
  const from = new Int32Array(blocked.length).fill(-1);
  const closed = new Uint8Array(blocked.length);
  const open = new MinHeap();
  cost[start] = 0;
  open.push(start, h(start));

  while (open.size) {
    const i = open.pop();
    if (i === goal) {
      const cells = [i];
      for (let c = i; c !== start; ) cells.push((c = from[c]!));
      return cells.reverse();
    }
    if (closed[i]) continue;
    closed[i] = 1;
    for (const n of neighbours(i, cols, rows)) {
      if (blocked[n.i] || closed[n.i]) continue;
      // No cutting corners: a diagonal step needs both orthogonal cells free.
      if (n.dx && n.dz && (blocked[i + n.dx] || blocked[i + n.dz * cols])) continue;
      const next = cost[i]! + n.cost;
      if (next < cost[n.i]!) {
        cost[n.i] = next;
        from[n.i] = i;
        open.push(n.i, next + h(n.i));
      }
    }
  }
  return null;
}

/** A binary min-heap of cell indices by priority. Stale entries are skipped by the caller's closed set. */
class MinHeap {
  private items: number[] = [];
  private keys: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, key: number) {
    const { items, keys } = this;
    let i = items.length;
    items.push(item);
    keys.push(key);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent]! <= key) break;
      items[i] = items[parent]!;
      keys[i] = keys[parent]!;
      i = parent;
    }
    items[i] = item;
    keys[i] = key;
  }

  pop(): number {
    const { items, keys } = this;
    const top = items[0]!;
    const lastItem = items.pop()!;
    const lastKey = keys.pop()!;
    if (items.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= items.length) break;
        const c = l + 1 < items.length && keys[l + 1]! < keys[l]! ? l + 1 : l;
        if (keys[c]! >= lastKey) break;
        items[i] = items[c]!;
        keys[i] = keys[c]!;
        i = c;
      }
      items[i] = lastItem;
      keys[i] = lastKey;
    }
    return top;
  }
}

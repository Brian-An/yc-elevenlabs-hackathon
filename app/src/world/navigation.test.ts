import { describe, expect, it } from "vitest";
import type { Bounds, Collider, Vec2 } from "./collision";
import { BOUNDS, CHARACTER_RADIUS, COLLIDERS, EXTRAS, TABLES, WAYPOINTS, seats } from "./layout";
import { createNavGrid } from "./navigation";
import { createStroller, stepStroller } from "./stroll";

const room: Bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const r = 0.35;

/** Whether walking the path from `from` keeps a circle of radius `r` clear of every collider. */
function pathIsClear(from: Vec2, path: Vec2[], colliders: Collider[]) {
  let a = from;
  for (const b of path) {
    for (let t = 0; t <= 1; t += 0.02) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const c of colliders) {
        if (c.kind === "circle" && Math.hypot(x - c.x, z - c.z) < c.r + r) return false;
      }
    }
    a = b;
  }
  return true;
}

describe("createNavGrid", () => {
  it("goes straight across open ground", () => {
    const path = createNavGrid([], room, r).findPath({ x: -5, z: 0 }, { x: 5, z: 0 });
    expect(path).toEqual([{ x: 5, z: 0 }]);
  });

  it("routes round an obstacle in the way", () => {
    const table: Collider = { kind: "circle", x: 0, z: 0, r: 1.5 };
    const from = { x: -5, z: 0 };
    const path = createNavGrid([table], room, r).findPath(from, { x: 5, z: 0 });
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual({ x: 5, z: 0 });
    expect(pathIsClear(from, path, [table])).toBe(true);
  });

  it("returns no path to a goal walled off from the start", () => {
    const wall: Collider = { kind: "box", minX: -1, maxX: 1, minZ: -10, maxZ: 10 };
    expect(createNavGrid([wall], room, r).findPath({ x: -5, z: 0 }, { x: 5, z: 0 })).toEqual([]);
  });

  it("starts from the nearest free ground when the start is inside an obstacle's margin", () => {
    const table: Collider = { kind: "circle", x: 0, z: 0, r: 1 };
    const path = createNavGrid([table], room, r).findPath({ x: 1.2, z: 0 }, { x: 5, z: 0 });
    expect(path.at(-1)).toEqual({ x: 5, z: 0 });
    expect(Math.hypot(path[0]!.x, path[0]!.z)).toBeGreaterThan(1 + r);
  });
});

describe("passers-by in the plaza", () => {
  it("never stall for long over ten minutes, even round the personas waiting at tables", () => {
    const waiting: Collider[] = TABLES.map((t) => ({ kind: "circle", ...seats(t).waiting, r: CHARACTER_RADIUS }));
    const nav = createNavGrid([...COLLIDERS, ...waiting], BOUNDS, CHARACTER_RADIUS);
    const player = { kind: "circle" as const, x: 0, z: 11, r: CHARACTER_RADIUS };
    const crowd = EXTRAS.map((e, i) => createStroller(i, e.start, WAYPOINTS));
    const dt = 1 / 60;
    const stalled = crowd.map(() => ({ since: { x: 0, z: 0 }, seconds: 0 }));
    let worst = 0;

    for (let frame = 0; frame < 60 * 600; frame++) {
      crowd.forEach((s, i) => {
        const people: Collider[] = [player, ...crowd.filter((o) => o !== s).map((o) => ({ kind: "circle" as const, x: o.x, z: o.z, r: CHARACTER_RADIUS }))];
        const walking = stepStroller(s, dt, WAYPOINTS, nav, nav.colliders, people, BOUNDS, CHARACTER_RADIUS);
        const st = stalled[i]!;
        if (!walking || Math.hypot(s.x - st.since.x, s.z - st.since.z) > 0.5) {
          st.since = { x: s.x, z: s.z };
          st.seconds = 0;
        } else {
          st.seconds += dt;
          worst = Math.max(worst, st.seconds);
        }
      });
    }
    // Brief jostles happen; anything past the stroller's own stall fallback means someone is wedged.
    expect(worst).toBeLessThan(2);
  });
});

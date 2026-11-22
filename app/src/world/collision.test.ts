import { describe, expect, it } from "vitest";
import { angleDelta, resolve, turnToward, yawTo, type Bounds, type Collider } from "./collision";

const open: Bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe("resolve", () => {
  it("leaves a point that touches nothing where it is", () => {
    const p = resolve({ x: 5, z: 5 }, 0.3, [{ kind: "circle", x: 0, z: 0, r: 1 }], open);
    expect(p).toEqual({ x: 5, z: 5 });
  });

  it("pushes a character out of a circle along the line from its centre", () => {
    const table: Collider = { kind: "circle", x: 0, z: 0, r: 1 };
    const p = resolve({ x: 0.5, z: 0 }, 0.3, [table], open);
    expect(p.x).toBeCloseTo(1.3);
    expect(p.z).toBeCloseTo(0);
  });

  it("pushes a character standing on a circle's exact centre out deterministically", () => {
    const p = resolve({ x: 0, z: 0 }, 0.3, [{ kind: "circle", x: 0, z: 0, r: 1 }], open);
    expect(p.x).toBeCloseTo(1.3);
  });

  it("slides a character off a box face it walked into", () => {
    const wall: Collider = { kind: "box", minX: -5, maxX: 5, minZ: -1, maxZ: 1 };
    const p = resolve({ x: 2, z: 1.1 }, 0.3, [wall], open);
    expect(p.x).toBeCloseTo(2);
    expect(p.z).toBeCloseTo(1.3);
  });

  it("moves a character whose centre is inside a box out through the nearest face", () => {
    const building: Collider = { kind: "box", minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const p = resolve({ x: 9.5, z: 4 }, 0.3, [building], open);
    expect(p.x).toBeCloseTo(10.3);
    expect(p.z).toBeCloseTo(4);
  });

  it("keeps a character inside the walkable bounds", () => {
    const p = resolve({ x: 50, z: -50 }, 0.3, [], { minX: -10, maxX: 10, minZ: -10, maxZ: 10 });
    expect(p).toEqual({ x: 9.7, z: -9.7 });
  });

  it("settles between two touching obstacles without overlapping either", () => {
    const a: Collider = { kind: "circle", x: -1, z: 0, r: 1 };
    const b: Collider = { kind: "circle", x: 1.2, z: 0, r: 1 };
    const p = resolve({ x: 0.1, z: 0.5 }, 0.3, [a, b], open);
    expect(dist(p, a)).toBeGreaterThanOrEqual(1.3 - 1e-6);
    expect(dist(p, b)).toBeGreaterThanOrEqual(1.3 - 1e-6);
  });
});

describe("angles", () => {
  it("takes the short way round", () => {
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2);
    expect(angleDelta(0.1, -0.1)).toBeCloseTo(-0.2);
  });

  it("turns by at most the step and lands exactly on the target", () => {
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25);
    expect(turnToward(0.9, 1, 0.25)).toBe(1);
  });

  it("faces +Z at yaw 0 and +X at a quarter turn", () => {
    expect(yawTo({ x: 0, z: 0 }, { x: 0, z: 5 })).toBeCloseTo(0);
    expect(yawTo({ x: 0, z: 0 }, { x: 5, z: 0 })).toBeCloseTo(Math.PI / 2);
  });
});

import { describe, expect, it } from "vitest";
import { BOUNDS, CHARACTER_RADIUS, COLLIDERS, TABLES, seats } from "./layout";
import { createNavGrid } from "./navigation";
import { leaveSeat, seatPath, stepSeatApproach, stepSeatExit } from "./seating";

describe("café seating", () => {
  it.each(["player", "persona"] as const)("routes the %s around the chair and lines up the sit and exit", (role) => {
    const nav = createNavGrid(COLLIDERS, BOUNDS, CHARACTER_RADIUS);
    for (const table of TABLES) {
      const seat = seats(table)[role];
      const pos = { x: seat.x, z: seat.z - Math.cos(seat.yaw) };
      const route = seatPath(nav, pos, seat);
      expect(route.path.at(-3)).toEqual(route.side);
      expect(route.path.at(-2)).toEqual(route.entry);

      let yaw = 0;
      let ready = false;
      for (let frame = 0; frame < 150 && !ready; frame++) {
        ({ yaw, ready } = stepSeatApproach(pos, yaw, route, 0.04, 0.2));
      }
      expect(ready).toBe(true);
      expect(pos).toEqual(seat.approach);
      expect(yaw).toBe(seat.yaw);

      const exit = leaveSeat(route)!;
      expect(exit.path).toEqual([route.entry, route.side]);
      for (let frame = 0; frame < 50 && exit.path.length; frame++) {
        stepSeatExit(pos, exit, 0.04);
      }
      expect(pos).toEqual(route.side);
    }
  });
});

import { turnToward, type Vec2 } from "./collision";
import type { Seat } from "./layout";
import type { NavGrid } from "./navigation";

type SeatPath = { path: Vec2[]; side: Vec2; entry: Vec2; seat: Seat; leaving: boolean };

/** Route around the furniture and enter the space between the chair and table from the side. */
export function seatPath(nav: NavGrid, from: Vec2, seat: Seat): SeatPath {
  // Turn in the gap before backing up to the cushion, so the shoulders and feet clear the chair.
  const entry = { x: seat.x, z: seat.approach.z + Math.cos(seat.yaw) * 0.12 };
  const side = {
    x: seat.x + (from.x < seat.x ? -0.9 : 0.9),
    z: entry.z,
  };
  return { path: [...nav.findPath(from, side), entry, seat.approach], side, entry, seat, leaving: false };
}

export function leaveSeat(route: SeatPath | null): SeatPath | null {
  if (!route || route.leaving) return route;
  if (route.path.length > 2) return null;
  const path = route.path.length === 2 ? [route.side] : [route.entry, route.side];
  return { ...route, path, leaving: true };
}

export function stepSeatApproach(pos: Vec2, yaw: number, route: SeatPath, distance: number, turn: number) {
  const facingSeat = route.path[0] === route.seat.approach || route.path.length === 0;
  if (facingSeat) {
    yaw = turnToward(yaw, route.seat.yaw, turn);
    if (yaw !== route.seat.yaw) return { yaw, walking: false, ready: false };
  }
  const heading = stepSeatPath(pos, route.path, distance);
  if (heading !== null && !facingSeat) yaw = turnToward(yaw, heading, turn);
  return { yaw, walking: heading !== null && !facingSeat, ready: facingSeat && route.path.length === 0 };
}

export function stepSeatExit(pos: Vec2, route: SeatPath, distance: number) {
  const clearingChair = route.path[0] === route.entry;
  const heading = stepSeatPath(pos, route.path, distance);
  return clearingChair ? null : heading;
}

/** Walk toward the next waypoint and return the angle of travel. */
function stepSeatPath(pos: Vec2, path: Vec2[], distance: number) {
  const target = path[0];
  if (!target) return null;
  const heading = stepToward(pos, target, distance);
  if (pos.x === target.x && pos.z === target.z) path.shift();
  return heading;
}

export function stepToward(pos: Vec2, target: Vec2, distance: number) {
  const dx = target.x - pos.x;
  const dz = target.z - pos.z;
  const remaining = Math.hypot(dx, dz);
  if (remaining <= distance) {
    pos.x = target.x;
    pos.z = target.z;
  } else {
    pos.x += (dx / remaining) * distance;
    pos.z += (dz / remaining) * distance;
  }
  return remaining > 0 ? Math.atan2(dx, dz) : null;
}

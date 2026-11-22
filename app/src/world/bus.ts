import type { Vec2 } from "./collision";

/**
 * Per-frame state the scene's characters share with each other and with the page.
 * It is a plain mutable object (one per world), not React state: positions change every frame.
 */
export type WorldBus = {
  player: Vec2;
  /** Passers-by positions, so the player can't walk through them and they don't walk through each other. */
  extras: Vec2[];
  /** The date persona's voice level, 0-1, while a date is on. */
  voice: () => number;
  /** Ground point the player was sent to with a tap or click, or null. */
  moveTarget: Vec2 | null;
};

export function createWorldBus(): WorldBus {
  return { player: { x: 0, z: 0 }, extras: [], voice: () => 0, moveTarget: null };
}

/** The date in progress, as the scene sees it: who, and at which table. */
export type WorldDate = { personaId: string; tableIndex: number };

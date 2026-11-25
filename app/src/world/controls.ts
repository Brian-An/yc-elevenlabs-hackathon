/** Keyboard controls for walking the plaza. Free of three.js so the page HUD can share them without loading the scene. */

/** Movement key codes to a direction relative to the camera: [right, forward]. */
export const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/**
 * Whether a key event belongs to a text field or an open dialog, where keys should type or move focus (arrow keys
 * switch tabs) rather than walk.
 */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || !!el.closest?.('[role="dialog"]'));
}

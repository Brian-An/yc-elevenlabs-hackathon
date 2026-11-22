/**
 * Where everything in the plaza stands, in metres. +X is east, -Z is north, and a model faces +Z at yaw 0.
 * Models live in public/models (see CREDITS.md there); props are named nodes inside a packed .glb.
 */
import type { Bounds, Collider, Vec2 } from "./collision";

export const MODELS = {
  city: "/models/city.glb",
  cafe: "/models/cafe.glb",
  nature: "/models/nature.glb",
} as const;

export const characterUrl = (name: string) => `/models/characters/${name}.glb`;

/** Scale of each prop pack into metres (KayKit city tiles are 2 units for a 10 m block). */
export const PACK_SCALE = { city: 5, cafe: 0.85, nature: 2.4 } as const;

/** Every character is scaled to this height, whatever its source units. */
export const CHARACTER_HEIGHT = 1.75;
export const CHARACTER_RADIUS = 0.35;

export const PLAYER = { model: "Casual_Male", spawn: { x: 0, z: 11 }, yaw: Math.PI };

/**
 * Skin tone per character model. The pack ships every "Skin" material near-black, so the world sets it here,
 * which also gives the crowd a range of skin tones.
 */
export const SKIN_TONE: Record<string, string> = {
  Casual_Male: "#e0ac8a",
  Casual_Female: "#f1c6a8",
  Casual3_Male: "#8d5a3b",
  Doctor_Female_Young: "#b97f55",
  Casual2_Female: "#6b4329",
  Suit_Male: "#f0c9a6",
  Casual3_Female: "#c68e63",
  Casual2_Male: "#e8b896",
  Suit_Female: "#7a4a2e",
  OldClassy_Female: "#f3d2b8",
  Worker_Male: "#a86f48",
  Chef_Female: "#e3b08c",
};
const DEFAULT_SKIN_TONE = "#d9a47f";
export const skinTone = (model: string) => SKIN_TONE[model] ?? DEFAULT_SKIN_TONE;

/** The look of each date persona, by persona id. Personas without an entry use the fallback. */
export const PERSONA_MODEL: Record<string, string> = {
  maya: "Casual_Female",
  theo: "Casual3_Male",
  priya: "Doctor_Female_Young", // just off her ER shift
  coach: "Suit_Male",
};
export const FALLBACK_PERSONA_MODEL = "Casual2_Female";

/** Walkable area: the paved plaza between the buildings and the road. */
export const BOUNDS: Bounds = { minX: -19, maxX: 19, minZ: -15, maxZ: 15.5 };

/** A café table for two. The persona waits beside it and both sit on its chairs during the date. */
export type Table = { id: string; x: number; z: number };

/** Date tables first, one per persona in order; the rest are decoration. */
export const TABLES: Table[] = [
  { id: "t1", x: -7, z: -5 },
  { id: "t2", x: 7, z: -5 },
  { id: "t3", x: 0, z: 3 },
  { id: "t4", x: -11, z: 6 },
  { id: "t5", x: 12, z: 6 },
];

const CHAIR_OFFSET = 1.69;
const SIT_OFFSET = 0.44;
export const CHAIR_DEPTH_SCALE = 0.72;
// Seat height fitted to the thighs in the last frame of the stock SitDown clip.
const CHAIR_HEIGHT_SCALE: Record<string, number> = { Casual_Male: 0.585, Casual3_Male: 0.655 };
export const chairHeightScale = (model: string) => CHAIR_HEIGHT_SCALE[model] ?? 0.6;

function seat(t: Table, side: -1 | 1) {
  return {
    x: t.x,
    z: t.z + side * CHAIR_OFFSET,
    yaw: side === -1 ? 0 : Math.PI,
    // The animation moves the hips back over the cushion while the feet stay here.
    approach: { x: t.x, z: t.z + side * (CHAIR_OFFSET - SIT_OFFSET) },
  };
}

export type Seat = ReturnType<typeof seat>;

/** The persona's seat faces south (toward the plaza entrance), the player's faces north. */
export const seats = (t: Table) => ({
  persona: seat(t, -1),
  player: seat(t, 1),
  /** Where the persona waits for you before the date: beside the table, facing the plaza. */
  waiting: { x: t.x + 1.4, z: t.z + 0.2, yaw: 0 },
});

/** How close the player has to be to a waiting persona to talk. */
export const TALK_RADIUS = 3.2;

type Placed = { name: string; x: number; z: number; y?: number; yaw?: number; scale?: number };

// KayKit buildings without their sidewalk slab: 6-10 m wide, entrance on +Z, modelled 0.5 m above their origin.
const building = (letter: string, x: number, z: number, yaw = 0): Placed => ({ name: `building_${letter}_withoutBase`, x, z, y: -0.5, yaw });
export const BUILDINGS: Placed[] = [
  building("E", -20, -21),
  building("G", -10, -21),
  building("H", 0, -21),
  building("F", 10, -21),
  building("G", 20, -21),
  building("D", -25, -10, Math.PI / 2),
  building("B", -25, 0, Math.PI / 2),
  building("F", -25, 10, Math.PI / 2),
  building("C", 25, -10, -Math.PI / 2),
  building("E", 25, 0, -Math.PI / 2),
  building("D", 25, 10, -Math.PI / 2),
];

/** The road along the south edge, as 10 m straight tiles running east-west. */
// Road tiles are 0.5 m thick at this scale, with the asphalt 0.35 m up between the curbs. Sink them so the asphalt
// sits just above the grass (at -0.02) and the curbs stand a kerb's height above the plaza.
const ROAD_SURFACE = 0.02;
export const ROAD_TILES: Placed[] = [-30, -20, -10, 0, 10, 20, 30].map((x) => ({ name: "road_straight", x, z: 21, y: ROAD_SURFACE - 0.35, yaw: Math.PI / 2 }));

// KayKit cars' wheels reach 0.3 m below the model origin; lift them onto the road surface.
const CAR_LIFT = ROAD_SURFACE + 0.3;
export const CARS: Placed[] = [
  { name: "car_taxi", x: -12, z: 18.4, y: CAR_LIFT, yaw: Math.PI / 2 },
  { name: "car_sedan", x: 4, z: 18.4, y: CAR_LIFT, yaw: Math.PI / 2 },
  { name: "car_hatchback", x: 15, z: 23.6, y: CAR_LIFT, yaw: -Math.PI / 2 },
];

export const TREES: Placed[] = [
  { name: "CommonTree_1", x: -15, z: -11 },
  { name: "CommonTree_3", x: 15, z: -11 },
  { name: "CommonTree_3", x: -16, z: 12 },
  { name: "CommonTree_1", x: 16, z: 12 },
  { name: "CommonTree_1", x: -2.5, z: -12 },
  { name: "CommonTree_3", x: 3.5, z: -12.5 },
];

export const PLANTS: Placed[] = [
  { name: "Flowers", x: -13, z: -12.5 },
  { name: "Flowers", x: 13.5, z: -12.8 },
  { name: "Plant_1", x: -17, z: 2 },
  { name: "Plant_1", x: 17, z: 2 },
  { name: "Flowers", x: 0.5, z: -13 },
];

// Benches face the plaza.
export const BENCHES: Placed[] = [
  { name: "bench", x: -17.5, z: -4, yaw: Math.PI / 2 },
  { name: "bench", x: 17.5, z: -4, yaw: -Math.PI / 2 },
  { name: "bench", x: -6, z: -13.5 },
  { name: "bench", x: 8, z: -13.5 },
];

export const LAMPS: Placed[] = [
  { name: "streetlight", x: -18, z: -14, yaw: Math.PI / 4 },
  { name: "streetlight", x: 18, z: -14, yaw: -Math.PI / 4 },
  { name: "streetlight", x: -18, z: 15, yaw: Math.PI * 0.75 },
  { name: "streetlight", x: 18, z: 15, yaw: -Math.PI * 0.75 },
];

/** Static obstacles in the walkable area. Buildings and the road sit outside BOUNDS and need none. */
export const COLLIDERS: Collider[] = [
  ...TABLES.flatMap((t): Collider[] => {
    const { persona, player } = seats(t);
    return [
      { kind: "circle", x: t.x, z: t.z, r: 0.85 },
      { kind: "box", minX: t.x - 0.32, maxX: t.x + 0.32, minZ: persona.z - 0.26, maxZ: persona.z + 0.23 },
      { kind: "box", minX: t.x - 0.32, maxX: t.x + 0.32, minZ: player.z - 0.23, maxZ: player.z + 0.26 },
    ];
  }),
  ...TREES.map((t) => ({ kind: "circle" as const, x: t.x, z: t.z, r: 0.85 })),
  ...PLANTS.map((p) => ({ kind: "circle" as const, x: p.x, z: p.z, r: 0.5 })),
  ...LAMPS.map((l) => ({ kind: "circle" as const, x: l.x, z: l.z, r: 0.25 })),
  ...BENCHES.map((b) => {
    const alongX = !b.yaw;
    return {
      kind: "box" as const,
      minX: b.x - (alongX ? 1 : 0.4),
      maxX: b.x + (alongX ? 1 : 0.4),
      minZ: b.z - (alongX ? 0.4 : 1),
      maxZ: b.z + (alongX ? 0.4 : 1),
    };
  }),
];

/** Open spots the passers-by walk between. Straight lines between them can cross a table; collision slides them round. */
export const WAYPOINTS: Vec2[] = [
  { x: -14, z: -8 }, { x: -3, z: -9 }, { x: 4, z: -9 }, { x: 14, z: -8 },
  { x: -15, z: 0 }, { x: -3, z: -2 }, { x: 3, z: -1 }, { x: 14, z: 0 },
  { x: -6, z: 2 }, { x: 6, z: 3 }, { x: -15, z: 9 }, { x: -5, z: 10 },
  { x: 5, z: 12 }, { x: 14, z: 11 }, { x: 0, z: 13 }, { x: -9, z: 13 },
];

/** Passers-by: who they look like and where they start. */
export const EXTRAS: { model: string; start: number }[] = [
  { model: "Casual2_Female", start: 0 },
  { model: "Suit_Male", start: 3 },
  { model: "Casual3_Female", start: 4 },
  { model: "Casual2_Male", start: 7 },
  { model: "Suit_Female", start: 10 },
  { model: "OldClassy_Female", start: 13 },
  { model: "Worker_Male", start: 9 },
  { model: "Chef_Female", start: 15 },
];

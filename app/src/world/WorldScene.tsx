import { Suspense, useEffect, useMemo } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import type { Persona } from "../shared/types";
import { preloadCharacters } from "./Character";
import type { Collider } from "./collision";
import { createNavGrid } from "./navigation";
import type { WorldBus, WorldDate } from "./bus";
import { DatePersona, Extra } from "./People";
import { Player } from "./Player";
import { Plaza } from "./Plaza";
import { BOUNDS, CHARACTER_RADIUS, COLLIDERS, EXTRAS, FALLBACK_PERSONA_MODEL, PERSONA_MODEL, PLAYER, TABLES, seats } from "./layout";

preloadCharacters([PLAYER.model, ...Object.values(PERSONA_MODEL), FALLBACK_PERSONA_MODEL, ...EXTRAS.map((e) => e.model)]);

/**
 * The 3D plaza: the player, passers-by, and one date persona waiting at each café table.
 * Default-exported for React.lazy, so three.js loads only on the world page.
 */
export default function WorldScene({
  personas,
  bus,
  date,
  nearby,
  onNearby,
  onReady,
}: {
  /** Date personas in table order (the first takes the first table). */
  personas: readonly Persona[];
  bus: WorldBus;
  date: WorldDate | null;
  nearby: string | null;
  onNearby: (personaId: string | null) => void;
  /** Called once every model has loaded and the first frame is drawn. */
  onReady: () => void;
}) {
  const placed = useMemo(
    () => personas.slice(0, TABLES.length).map((persona, i) => ({ persona, table: TABLES[i]!, tableIndex: i })),
    [personas],
  );
  // Waiting personas the player can walk up to. The one on a date is at the table instead.
  const waiting = useMemo(() => {
    const map = new Map<string, { x: number; z: number }>();
    for (const p of placed) if (p.persona.id !== date?.personaId) map.set(p.persona.id, seats(p.table).waiting);
    return map;
  }, [placed, date]);
  const waitingColliders = useMemo<Collider[]>(
    () => [...waiting.values()].map((w) => ({ kind: "circle", x: w.x, z: w.z, r: CHARACTER_RADIUS })),
    [waiting],
  );
  // The waiting personas stand still, so passers-by route round them like the tables they wait beside.
  const nav = useMemo(() => createNavGrid([...COLLIDERS, ...waitingColliders], BOUNDS, CHARACTER_RADIUS), [waitingColliders]);

  const walkTo = (e: ThreeEvent<MouseEvent>) => {
    // A drag turns the camera; only a tap walks.
    if (date || e.delta > 5) return;
    bus.moveTarget = { x: e.point.x, z: e.point.z };
  };

  return (
    <Canvas
      shadows
      // Full resolution on ordinary screens, capped on 3x phones where it would shade 9x the pixels.
      dpr={[1, 1.75]}
      camera={{ fov: 50, near: 0.1, far: 200, position: [0, 4, 18] }}
      onCreated={({ gl }) => gl.domElement.setAttribute("aria-hidden", "true")}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#bfe1f2"]} />
      <fog attach="fog" args={["#bfe1f2", 45, 110]} />
      <hemisphereLight args={["#e4f3ff", "#a2b98a", 1.25]} />
      <directionalLight
        position={[16, 28, 12]}
        intensity={2.3}
        color="#fff4e2"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-32}
        shadow-camera-right={32}
        shadow-camera-top={32}
        shadow-camera-bottom={-32}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />

      <Suspense fallback={null}>
        <Plaza personaModels={placed.map(({ persona }) => PERSONA_MODEL[persona.id] ?? FALLBACK_PERSONA_MODEL)} />
        {/* An invisible floor that catches taps to walk. */}
        <mesh rotation-x={-Math.PI / 2} position-y={0.02} onClick={walkTo}>
          <planeGeometry args={[60, 60]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        <Player bus={bus} date={date} waiting={waiting} nav={nav} onNearby={onNearby} />
        {placed.map(({ persona, table }) => (
          <DatePersona
            key={persona.id}
            persona={persona}
            model={PERSONA_MODEL[persona.id] ?? FALLBACK_PERSONA_MODEL}
            table={table}
            bus={bus}
            nav={nav}
            onDate={date?.personaId === persona.id}
            nearby={nearby === persona.id}
          />
        ))}
        {EXTRAS.map((e, i) => (
          <Extra key={i} index={i} model={e.model} start={e.start} bus={bus} nav={nav} />
        ))}
        <Ready onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}

/** Renders inside Suspense, so its effect runs only after every model above has loaded. */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => onReady(), [onReady]);
  return null;
}

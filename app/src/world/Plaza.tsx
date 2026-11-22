import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { Mesh, Object3D } from "three";
import {
  BENCHES,
  BUILDINGS,
  CARS,
  CHAIR_DEPTH_SCALE,
  FALLBACK_PERSONA_MODEL,
  LAMPS,
  MODELS,
  PACK_SCALE,
  PLAYER,
  PLANTS,
  ROAD_TILES,
  TABLES,
  TREES,
  chairHeightScale,
  seats,
} from "./layout";

type Pack = keyof typeof MODELS;

/** One named piece of a packed prop .glb, scaled into metres. Copies share geometry and materials. */
function Prop({ pack, name, x, z, y = 0, yaw = 0, scale = 1, height = 1, depth = 1 }: { pack: Pack; name: string; x: number; z: number; y?: number; yaw?: number; scale?: number; height?: number; depth?: number }) {
  const { nodes } = useGLTF(MODELS[pack]);
  const object = useMemo(() => {
    const source = nodes[name] as Object3D | undefined;
    if (!source) throw new Error(`No "${name}" in ${MODELS[pack]}`);
    // Keep the piece's own transform (its scale and height offset) and place it with the wrapping group.
    const copy = source.clone(true);
    copy.traverse((o) => {
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return copy;
  }, [nodes, name, pack]);
  const size = PACK_SCALE[pack] * scale;
  return (
    <group position={[x, y, z]} rotation-y={yaw} scale={[size, size * height, size * depth]}>
      <primitive object={object} />
    </group>
  );
}

/** The plaza: paving, buildings on three sides, the road on the fourth, trees, benches and café tables. */
export function Plaza({ personaModels }: { personaModels: readonly string[] }) {
  return (
    <group>
      {/* Grass beyond the buildings, then the paved plaza on top. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02} receiveShadow>
        <planeGeometry args={[160, 160]} />
        <meshStandardMaterial color="#8fb573" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, -0.5]} receiveShadow>
        <planeGeometry args={[42, 34]} />
        <meshStandardMaterial color="#e8dccb" roughness={0.95} />
      </mesh>
      {/* A darker inlay ring around the middle table. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.005, 3]} receiveShadow>
        <ringGeometry args={[3.2, 3.6, 48]} />
        <meshStandardMaterial color="#cdbba3" roughness={0.95} />
      </mesh>
      {/* Pavement strip between the plaza and the road. */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 16.6]} receiveShadow>
        <planeGeometry args={[70, 1.2]} />
        <meshStandardMaterial color="#b9b1a6" roughness={1} />
      </mesh>

      {BUILDINGS.map((b, i) => (
        <Prop key={`b${i}`} pack="city" {...b} />
      ))}
      {ROAD_TILES.map((r, i) => (
        <Prop key={`r${i}`} pack="city" {...r} />
      ))}
      {CARS.map((c, i) => (
        <Prop key={`c${i}`} pack="city" {...c} />
      ))}
      {BENCHES.map((b, i) => (
        <Prop key={`be${i}`} pack="city" {...b} />
      ))}
      {LAMPS.map((l, i) => (
        <Prop key={`l${i}`} pack="city" {...l} />
      ))}
      {TREES.map((t, i) => (
        <Prop key={`t${i}`} pack="nature" {...t} />
      ))}
      {PLANTS.map((p, i) => (
        <Prop key={`p${i}`} pack="nature" {...p} scale={0.6} />
      ))}

      {TABLES.map((t, index) => {
        const { persona, player } = seats(t);
        return (
          <group key={t.id}>
            {/* Turned so the menu card stands edge-on between the two chairs instead of hiding the persona's face. */}
            <Prop pack="cafe" name="table_round_A_small_decorated" x={t.x} z={t.z} yaw={Math.PI / 2} />
            <Prop pack="cafe" name="chair_A" {...persona} height={chairHeightScale(personaModels[index] ?? FALLBACK_PERSONA_MODEL)} depth={CHAIR_DEPTH_SCALE} />
            <Prop pack="cafe" name="chair_A" {...player} height={chairHeightScale(PLAYER.model)} depth={CHAIR_DEPTH_SCALE} />
          </group>
        );
      })}
    </group>
  );
}

for (const url of Object.values(MODELS)) useGLTF.preload(url);

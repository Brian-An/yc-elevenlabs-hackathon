import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import type { Mesh, MeshBasicMaterial } from "three";
import { Clapperboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { STUDIO } from "./layout";

/** Matches the plaza's pink accent, so the mat reads as somewhere to go rather than paving. */
const MAT_COLOR = "#e58bbd";

/**
 * The studio entrance: a softly pulsing mat in front of the east building's door, and a sign above the door.
 * Standing on the mat brings up the prompt to open your characters and past dates.
 */
export function Studio({ nearby }: { nearby: boolean }) {
  const pulse = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const ring = pulse.current;
    if (!ring) return;
    // One slow breath every 2 s: the ring grows a little and fades, so the mat catches the eye without flashing.
    const t = (clock.elapsedTime % 2) / 2;
    ring.scale.setScalar(1 + t * 0.35);
    (ring.material as MeshBasicMaterial).opacity = 0.55 * (1 - t);
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[STUDIO.x, 0.015, STUDIO.z]}>
        <circleGeometry args={[STUDIO.reach - 0.4, 48]} />
        <meshBasicMaterial color={MAT_COLOR} transparent opacity={nearby ? 0.45 : 0.28} depthWrite={false} />
      </mesh>
      <mesh ref={pulse} rotation-x={-Math.PI / 2} position={[STUDIO.x, 0.02, STUDIO.z]}>
        <ringGeometry args={[STUDIO.reach - 0.5, STUDIO.reach - 0.35, 48]} />
        <meshBasicMaterial color={MAT_COLOR} transparent opacity={0.5} depthWrite={false} />
      </mesh>
      <Html position={[STUDIO.door.x - 0.4, 3.6, STUDIO.door.z]} center zIndexRange={[10, 0]} pointerEvents="none">
        <div
          className={cn(
            "flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-sm shadow-(--shadow-resting) transition-colors",
            nearby ? "border-brand bg-brand text-accent-foreground" : "border-border bg-surface/90 text-foreground",
          )}
        >
          <Clapperboard className="size-4" aria-hidden="true" />
          <span className="font-medium">Studio</span>
          <span className={nearby ? "opacity-85" : "text-subtle"}>Characters and past dates</span>
        </div>
      </Html>
    </group>
  );
}

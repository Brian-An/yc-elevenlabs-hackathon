import { useEffect, useMemo, useRef, type Ref } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { AnimationMixer, Box3, LoopOnce, LoopRepeat, Quaternion, type AnimationAction, type Bone, type Group, type Mesh, type MeshStandardMaterial, type Object3D } from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { CHARACTER_HEIGHT, characterUrl, skinTone } from "./layout";

/** Clips every character model carries (the rest are stripped at import, see public/models/CREDITS.md). */
export type Clip = "Idle" | "Walk" | "Run" | "SitDown" | "StandUp" | "Victory";

const ONE_SHOT: ReadonlySet<Clip> = new Set(["SitDown", "StandUp", "Victory"]);

/** Scale and floor offset per model, measured once from its bind pose. */
const fit = new Map<string, { scale: number; lift: number }>();

function measure(url: string, model: Object3D) {
  const cached = fit.get(url);
  if (cached) return cached;
  model.updateMatrixWorld(true);
  const box = new Box3().setFromObject(model, true);
  const height = box.max.y - box.min.y;
  const scale = height > 0 ? CHARACTER_HEIGHT / height : 1;
  const result = { scale, lift: -box.min.y * scale };
  fit.set(url, result);
  return result;
}

/**
 * An animated low-poly character. The parent moves it by writing to `groupRef` each frame (no React state per frame)
 * and picks the clip with `clip`; changing it cross-fades. One-shot clips (sitting down, cheering) hold their last pose.
 *
 * `voice` returns 0-1 while the character talks; it nods the head and sways the chest on top of the current clip.
 */
export function Character({
  model,
  clip,
  groupRef,
  voice,
  timeScale = 1,
  onSit,
  onStand,
}: {
  model: string;
  clip: Clip;
  groupRef?: Ref<Group>;
  voice?: () => number;
  timeScale?: number;
  onSit?: () => void;
  onStand?: () => void;
}) {
  const url = characterUrl(model);
  const { scene, animations } = useGLTF(url);

  // SkeletonUtils.clone rebinds each copy's skin to its own bones, so the same model can walk around several times.
  const instance = useMemo(() => {
    const copy = cloneSkinned(scene);
    copy.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      // Skinned bounds come from the bind pose; animation can move limbs outside them.
      mesh.frustumCulled = false;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = materials.map((m) => {
        if (m.name !== "Skin") return m;
        const tinted = (m as MeshStandardMaterial).clone();
        tinted.color.set(skinTone(model));
        return tinted;
      });
      if (mesh.material.length === 1) mesh.material = mesh.material[0]!;
    });
    return copy;
  }, [scene, model]);
  const { scale, lift } = useMemo(() => measure(url, instance), [url, instance]);

  const bones = useMemo(() => {
    let head: Bone | undefined;
    let chest: Bone | undefined;
    instance.traverse((o) => {
      if (o.name === "Head") head = o as Bone;
      if (o.name === "Torso") chest = o as Bone;
    });
    return { head, chest };
  }, [instance]);

  const mixer = useMemo(() => new AnimationMixer(instance), [instance]);
  const actions = useMemo(() => {
    const byName = new Map<string, AnimationAction>();
    for (const a of animations) byName.set(a.name, mixer.clipAction(a));
    return byName;
  }, [animations, mixer]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  const current = useRef<{ clip: Clip; action: AnimationAction } | null>(null);
  useEffect(() => {
    // Reversing the same pose keeps feet and clothing aligned, even if the date ends mid-sit.
    const standing = clip === "StandUp";
    const next = actions.get(standing ? "SitDown" : clip);
    if (!next) return;
    const prev = current.current;
    if (prev?.action === next && prev.clip === clip) return;
    if (prev?.action !== next) {
      next.reset();
      if (ONE_SHOT.has(clip)) {
        next.setLoop(LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(LoopRepeat, Infinity);
      }
      if (standing) next.time = next.getClip().duration;
      if (prev) next.crossFadeFrom(prev.action, 0.25, false);
    }
    next.enabled = true;
    next.paused = false;
    next.setEffectiveTimeScale(standing ? -1 : 1);
    next.play();
    current.current = { clip, action: next };
  }, [clip, actions]);

  useEffect(() => {
    if (!onSit && !onStand) return;
    const finished = ({ action, direction }: { action: AnimationAction; direction: number }) => {
      const playing = current.current;
      if (playing?.action !== action) return;
      if (direction > 0 && playing.clip === "SitDown") onSit?.();
      if (direction < 0 && playing.clip === "StandUp") onStand?.();
    };
    mixer.addEventListener("finished", finished);
    return () => mixer.removeEventListener("finished", finished);
  }, [mixer, onSit, onStand]);

  const talk = useRef(0);
  // The talking motion is added on top of the clip's pose. A clip that doesn't key a bone would let it pile up
  // frame after frame, so each frame starts from the pose the clip left before the offset.
  const clipPose = useMemo(() => ({ head: new Quaternion(), chest: new Quaternion(), saved: false }), []);
  useFrame((state, dt) => {
    if (clipPose.saved) {
      bones.head?.quaternion.copy(clipPose.head);
      bones.chest?.quaternion.copy(clipPose.chest);
      clipPose.saved = false;
    }
    mixer.timeScale = timeScale;
    mixer.update(Math.min(dt, 0.1));
    if (!voice) return;
    if (bones.head) clipPose.head.copy(bones.head.quaternion);
    if (bones.chest) clipPose.chest.copy(bones.chest.quaternion);
    clipPose.saved = true;
    // Ease toward the voice level so syllables read as motion, not jitter.
    talk.current += (voice() - talk.current) * Math.min(1, dt * 14);
    const t = state.clock.elapsedTime;
    const v = talk.current;
    if (bones.head) {
      bones.head.rotation.x += v * (0.12 + 0.06 * Math.sin(t * 7.3));
      bones.head.rotation.y += v * 0.08 * Math.sin(t * 2.1);
      bones.head.rotation.z += v * 0.05 * Math.sin(t * 3.7);
    }
    if (bones.chest) bones.chest.rotation.y += v * 0.05 * Math.sin(t * 1.7);
  });

  return (
    <group ref={groupRef}>
      <primitive object={instance} scale={scale} position-y={lift} />
    </group>
  );
}

/** Starts loading every model a scene needs before it mounts, so characters don't pop in one by one. */
export function preloadCharacters(models: readonly string[]) {
  for (const m of new Set(models)) useGLTF.preload(characterUrl(m));
}

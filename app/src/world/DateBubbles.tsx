import { Html } from "@react-three/drei";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Mic } from "lucide-react";
import type { ReactNode } from "react";
import { MoveBadge } from "@/components/MoveReview";
import { cn } from "@/lib/utils";
import type { DateTalk } from "./bus";
import { yawTo } from "./collision";
import { seats, TABLES } from "./layout";

/** The persona's bubble sits just above their head. */
const PERSONA_BUBBLE_HEIGHT = 1.78;
/**
 * The player sits close to the camera, so a bubble above their head would land on the persona's face.
 * Theirs sits beside their head instead, toward the camera's side (see the date camera in Player.tsx).
 */
const PLAYER_BUBBLE = { height: 1.2, side: 0.95 };

/**
 * Speech bubbles over the two seated characters, in the scene rather than in a panel:
 * each one shows that person's latest line, the last speaker's in front. Typing dots while the persona starts a reply,
 * "Your turn" over the player while the mic is open, and each reply's grade pops up over the player as it lands.
 * Screen readers get the same lines from the page's live region, so all of this is aria-hidden.
 */
export function DateBubbles({ tableIndex, personaName, talk }: { tableIndex: number; personaName: string; talk: DateTalk }) {
  const s = seats(TABLES[tableIndex]!);
  const facing = yawTo(s.player, s.persona);
  const playerAnchor = {
    x: s.player.x - Math.cos(facing) * PLAYER_BUBBLE.side,
    z: s.player.z + Math.sin(facing) * PLAYER_BUBBLE.side,
  };
  const personaFront = talk.lastSpeaker !== "user";
  const thinking = talk.personaSpeaking && talk.lastSpeaker === "user";

  return (
    <>
      <Anchor x={s.persona.x} y={PERSONA_BUBBLE_HEIGHT} z={s.persona.z} front={personaFront}>
        {(talk.personaLine || thinking) && (
          <Bubble name={personaName} tone="persona" dim={!personaFront}>
            {thinking ? <TypingDots /> : talk.personaLine}
          </Bubble>
        )}
      </Anchor>

      <Anchor x={playerAnchor.x} y={PLAYER_BUBBLE.height} z={playerAnchor.z} front={!personaFront}>
        <div className="flex flex-col items-center gap-2">
          <GradePop grade={talk.grade} />
          {talk.playerLine && (
            <Bubble name="You" tone="player" dim={personaFront}>
              {talk.playerLine}
            </Bubble>
          )}
          {talk.listening && <YourTurn />}
        </div>
      </Anchor>
    </>
  );
}

/** A DOM overlay pinned to a point in the scene, growing upward from it. */
function Anchor({ x, y, z, front, children }: { x: number; y: number; z: number; front: boolean; children: ReactNode }) {
  return (
    <Html position={[x, y, z]} zIndexRange={front ? [20, 11] : [10, 0]} pointerEvents="none">
      <div className="-translate-x-1/2 -translate-y-full" aria-hidden="true">
        {children}
      </div>
    </Html>
  );
}

function Bubble({ name, tone, dim, children }: { name: string; tone: "persona" | "player"; dim: boolean; children: ReactNode }) {
  return (
    <div className={cn("relative w-max max-w-[min(18rem,70vw)] transition-opacity duration-300", dim && "opacity-75")}>
      <div
        className={cn(
          "rounded-2xl px-3.5 py-2.5 text-sm leading-snug shadow-(--shadow-resting)",
          tone === "persona" ? "bg-white text-neutral-900" : "bg-brand text-white",
        )}
      >
        <p className={cn("mb-0.5 text-xs font-medium", tone === "persona" ? "text-neutral-500" : "text-white/80")}>{name}</p>
        {children}
      </div>
      {/* The tail, pointing down at the speaker's head. */}
      <span
        className={cn("absolute left-1/2 top-full -ml-2 size-0 border-x-8 border-t-8 border-x-transparent", tone === "persona" ? "border-t-white" : "border-t-brand")}
      />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="flex h-5 items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-neutral-400 motion-reduce:animate-none"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function YourTurn() {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
      <Mic className="size-3.5" aria-hidden="true" />
      Your turn
      <span className="flex h-3 items-end gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-0.5 animate-pulse rounded-full bg-white motion-reduce:animate-none"
            style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.2}s` }}
          />
        ))}
      </span>
    </span>
  );
}

/** Floats the latest grade up and away, once per reply. */
function GradePop({ grade }: { grade: DateTalk["grade"] }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {grade && (
        <motion.div
          key={grade.turnIndex}
          initial={{ opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.9 }}
          animate={{ opacity: [0, 1, 1, 0], y: reduce ? 0 : [12, 0, -6, -20], scale: 1 }}
          transition={{ duration: 3.2, times: [0, 0.12, 0.75, 1], ease: "easeOut" }}
          className="drop-shadow-md"
        >
          <MoveBadge move={grade.move} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

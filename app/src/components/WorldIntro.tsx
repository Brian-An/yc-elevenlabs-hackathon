import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { getPersonas, useQuery } from "wasp/client/operations";
import { Button } from "@/components/arc/button/button";
import { motionTokens } from "@/components/arc/motion-tokens";
import { getUserId } from "@/client/userId";
import { createWorldBus } from "@/world/bus";

const WorldScene = lazy(() => import("@/world/WorldScene"));

const SEEN_KEY = "bantr:worldIntroSeen";
/** How long the plaza stays on screen once it has drawn, before fading into onboarding. */
const HOLD_MS = 2800;
/** If the plaza hasn't drawn by then (slow network, no WebGL), onboarding starts without it. */
const GIVE_UP_MS = 9000;
/** A slow fade, since this is the one large scene change of the first visit. */
const FADE_S = 0.9;

function seenThisSession() {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Without storage the intro plays again on reload, which is harmless.
  }
}

/**
 * A look at the 3D plaza before the first-run questions, which fades away to reveal them.
 * It plays once per browser session, so reloading partway through onboarding doesn't replay it.
 */
export function WorldIntro() {
  const [open, setOpen] = useState(() => !seenThisSession());
  const [ready, setReady] = useState(false);
  const reduceMotion = useReducedMotion();
  const personas = useQuery(getPersonas, { userId: getUserId() }, { enabled: open });
  const bus = useMemo(createWorldBus, []);
  const onReady = useCallback(() => setReady(true), []);

  const close = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(close, ready ? HOLD_MS : GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [open, ready, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="world-intro"
          className="fixed inset-0 z-50 bg-[#bfe1f2]"
          initial={false}
          exit={{ opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: FADE_S, ease: motionTokens.ease.inOut }}
        >
          {/* The scene is decoration: taps and keys skip it rather than walking the player around. */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {personas.data && (
              <Suspense fallback={null}>
                <WorldScene personas={personas.data} bus={bus} date={null} nearby={null} onNearby={() => {}} onReady={onReady} ambientVoices={false} />
              </Suspense>
            )}
          </div>
          <motion.div
            className="absolute inset-x-0 bottom-0 flex justify-end p-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ duration: motionTokens.duration.considered, ease: motionTokens.ease.enter }}
          >
            <Button variant="secondary" size="sm" onClick={close}>Skip intro</Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

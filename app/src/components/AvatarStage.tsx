import { useEffect, useRef, type ReactNode } from "react";
import type { Persona } from "../shared/types";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { cn } from "@/lib/utils";

/**
 * The persona's live video. ElevenLabs agents get their video avatar from a partner
 * (LiveAvatar/HeyGen, Runway or D-ID), which arrives as a WebRTC MediaStream.
 * Pass it as `stream`; until it arrives the persona's initial stands in.
 * `overlay` sits on top of the video (status, timer, name). `volume` (0-1) makes the stand-in's halo follow the voice.
 */
export function AvatarStage({
  persona,
  stream,
  speaking = false,
  volume,
  overlay,
  className,
}: {
  persona: Persona;
  stream: MediaStream | null;
  speaking?: boolean;
  volume?: () => number;
  overlay?: ReactNode;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-(--radius-panel) border border-border bg-surface-muted shadow-(--shadow-resting)",
        className,
      )}
    >
      {/* Audio plays through the ElevenLabs session, so the video stays muted. */}
      <video
        ref={video}
        autoPlay
        playsInline
        muted
        aria-label={`${persona.name}'s video`}
        className={cn("absolute inset-0 size-full object-cover", !stream && "hidden")}
      />
      {!stream && (
        <div className="absolute inset-0 grid place-items-center">
          <PersonaAvatar persona={persona} size={168} speaking={speaking} volume={volume} />
        </div>
      )}
      {overlay}
    </div>
  );
}

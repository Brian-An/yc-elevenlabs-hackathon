import { useEffect, useRef, type ReactNode } from "react";
import type { Persona } from "../shared/types";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { cn } from "@/lib/utils";

/**
 * The persona's live video. Either a WebRTC `stream` (muted; audio plays through the
 * ElevenLabs session separately), or `attach` for providers like HeyGen LiveAvatar that
 * hand back video by attaching to an element directly instead of exposing a MediaStream
 * (their audio comes through this same element, so it stays unmuted). Pass `videoReady`
 * with `attach` since attaching doesn't by itself mean a frame has arrived yet.
 * Until video is ready, the persona's photo stands in, and `volume` (0-1) makes its halo
 * follow the voice. `overlay` sits on top of the video (status, timer, name).
 */
export function AvatarStage({
  persona,
  stream,
  attach,
  videoReady,
  speaking = false,
  volume,
  overlay,
  className,
}: {
  persona: Persona;
  stream: MediaStream | null;
  attach?: (el: HTMLVideoElement) => void;
  videoReady?: boolean;
  speaking?: boolean;
  volume?: () => number;
  overlay?: ReactNode;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const ready = attach ? Boolean(videoReady) : Boolean(stream);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (attach) {
      attach(el);
      return;
    }
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, attach]);

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-(--radius-panel) border border-border bg-surface-muted shadow-(--shadow-resting)",
        className,
      )}
    >
      <video
        ref={video}
        autoPlay
        playsInline
        muted={!attach}
        aria-label={`${persona.name}'s video`}
        className={cn("absolute inset-0 size-full object-cover", !ready && "hidden")}
      />
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <PersonaAvatar persona={persona} size={168} speaking={speaking} volume={volume} />
        </div>
      )}
      {overlay}
    </div>
  );
}

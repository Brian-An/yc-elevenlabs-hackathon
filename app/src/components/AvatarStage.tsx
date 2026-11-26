import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Persona } from "../shared/types";
import { PersonaAvatar } from "@/components/PersonaAvatar";
import { cn } from "@/lib/utils";

// Anam renders 3:2. The real ratio replaces this once the video's metadata loads.
const DEFAULT_ASPECT = 3 / 2;

/**
 * The persona's live video. Either a WebRTC `stream` (muted; audio plays through the
 * ElevenLabs session separately), or `attach` for providers like Anam that
 * hand back video by attaching to an element directly instead of exposing a MediaStream
 * (their audio comes through this same element, so it stays unmuted). Pass `videoReady`
 * with `attach` since attaching doesn't by itself mean a frame has arrived yet.
 *
 * The whole frame shows at its own aspect ratio, so the avatar is never cropped to fill a wide
 * stage, and a blurred copy of the same video fills the space around it. `frameClassName` pads
 * the frame clear of overlays such as a header and a control bar.
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
  frameClassName,
}: {
  persona: Persona;
  stream: MediaStream | null;
  attach?: (el: HTMLVideoElement) => void;
  videoReady?: boolean;
  speaking?: boolean;
  volume?: () => number;
  overlay?: ReactNode;
  className?: string;
  frameClassName?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const backdrop = useRef<HTMLVideoElement>(null);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
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

  // The backdrop mirrors the video track only, so the persona's audio never plays twice.
  useEffect(() => {
    const source = video.current?.srcObject;
    const el = backdrop.current;
    if (!ready || !el || !(source instanceof MediaStream)) return;
    el.srcObject = new MediaStream(source.getVideoTracks());
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [ready]);

  const onMetadata = () => {
    const el = video.current;
    if (el?.videoWidth && el.videoHeight) setAspect(el.videoWidth / el.videoHeight);
  };

  return (
    <div
      className={cn(
        "relative isolate overflow-hidden rounded-(--radius-panel) border border-border bg-surface-muted shadow-(--shadow-resting)",
        className,
      )}
    >
      <video
        ref={backdrop}
        autoPlay
        playsInline
        muted
        aria-hidden="true"
        tabIndex={-1}
        className={cn("absolute inset-0 size-full scale-110 object-cover blur-2xl brightness-75", !ready && "hidden")}
      />
      <div className={cn("absolute inset-0 grid place-items-center [container-type:size]", frameClassName, !ready && "hidden")}>
        <div
          className="overflow-hidden rounded-(--radius-panel)"
          style={{ width: `min(100cqw, 100cqh * ${aspect})`, aspectRatio: aspect }}
        >
          <video
            ref={video}
            autoPlay
            playsInline
            muted={!attach}
            onLoadedMetadata={onMetadata}
            onResize={onMetadata}
            aria-label={`${persona.name}'s video`}
            className="size-full object-cover"
          />
        </div>
      </div>
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <PersonaAvatar persona={persona} size={168} speaking={speaking} volume={volume} />
        </div>
      )}
      {overlay}
    </div>
  );
}

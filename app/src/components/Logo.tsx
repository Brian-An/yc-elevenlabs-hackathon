import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-heading text-[15px] font-medium tracking-tight text-foreground", className)}>
      <span className="grid size-7 place-items-center rounded-full bg-brand-subtle text-brand-strong">
        <Heart className="size-3.5" strokeWidth={2} fill="currentColor" aria-hidden="true" />
      </span>
      <span className={cn(compact && "sr-only sm:not-sr-only")}>bantr</span>
    </span>
  );
}

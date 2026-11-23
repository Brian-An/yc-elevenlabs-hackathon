import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** One short line under the action that failed, so the reason sits where the user is already looking. */
export function InlineError({ children, className }: { children: string; className?: string }) {
  return (
    <p role="alert" className={cn("flex items-start justify-center gap-1.5 text-sm text-(--danger)", className)}>
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
